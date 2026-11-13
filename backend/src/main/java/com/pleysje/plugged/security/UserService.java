// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import com.pleysje.plugged.dto.AuthRequests;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.SymbolRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The user accounts: the administrator of the first start, registration, signing in and approval.
 * <ul>
 *   <li>As long as there is no administrator, only {@link #setup} is possible: it creates the administrator with the address of
 *       plugged.admin.email (which cannot be chosen or changed), approved from the start.</li>
 *   <li>Anyone can {@link #register}; the account cannot sign in until an administrator has {@link #approve approved} it.</li>
 *   <li>An administrator can make another account administrator, or an ordinary user again ({@link #setAdmin}). The administrator of
 *       plugged.admin.email (the primary administrator) always stays one, and nobody takes the role away from himself.</li>
 *   <li>Projects and symbols saved before accounts existed belong to the primary administrator; the projects and personal symbols of a
 *       removed account go to the administrator who removed it.</li>
 *   <li>Too many wrong passwords in a row (plugged.auth.max-failed-logins) lock an account for plugged.auth.lockout; an administrator can
 *       {@link #unlock} it earlier (see also {@link LoginThrottle}).</li>
 * </ul>
 * The request bodies are checked with Bean Validation before they get here (see AuthRequests).
 */
@Service
public class UserService {
    private static final Logger log = LoggerFactory.getLogger(UserService.class);
    private static final Pattern EMAIL = Pattern.compile(AuthRequests.EMAIL_PATTERN);

    private final UserRepository users;
    private final ProjectRepository projects;
    private final UserGroupRepository groups;
    private final SymbolRepository symbols;
    private final PasswordEncoder passwordEncoder;
    private final LoginThrottle throttle;
    private final String adminEmail;
    /** Compared with when the email address is unknown, so a wrong address takes as long as a wrong password. */
    private final String dummyHash;

    public UserService(UserRepository users, ProjectRepository projects, UserGroupRepository groups, SymbolRepository symbols,
                       PasswordEncoder passwordEncoder, LoginThrottle throttle, @Value("${plugged.admin.email:}") String adminEmail) {
        this.users = users;
        this.projects = projects;
        this.groups = groups;
        this.symbols = symbols;
        this.passwordEncoder = passwordEncoder;
        this.throttle = throttle;
        this.adminEmail = normalizeEmail(adminEmail);
        this.dummyHash = passwordEncoder.encode("not-a-password-of-anyone");
        if (this.adminEmail.isEmpty()) log.warn("plugged.admin.email (PLUGGED_ADMIN_EMAIL) is not set: no administrator can be created, so nobody can sign in");
        else if (!EMAIL.matcher(this.adminEmail).matches()) log.warn("plugged.admin.email (PLUGGED_ADMIN_EMAIL) is not a valid email address");
    }

    /** The fixed address of the administrator (lower case; empty when not configured). */
    public String adminEmail() {
        return adminEmail;
    }

    /** True until the administrator account has been created. */
    public boolean setupRequired() {
        return !users.existsByAdminTrue();
    }

    /** First start: creates the administrator account (email = plugged.admin.email, approved). Refused once there is an administrator. */
    @Transactional
    public synchronized AppUser setup(AuthRequests.Setup request) {
        if (!setupRequired()) throw new LocalizedStatusException(HttpStatus.CONFLICT, "auth.setupDone");
        if (adminEmail.isEmpty() || !EMAIL.matcher(adminEmail).matches()) throw new LocalizedStatusException(HttpStatus.CONFLICT, "auth.adminEmailMissing");
        AppUser admin = users.findByEmail(adminEmail).orElse(null);
        if (admin != null) users.delete(admin); // an account that registered with this address before it became the administrator's
        admin = newUser(request.name(), request.surname(), adminEmail, request.password());
        admin.setAdmin(true);
        admin.setApproved(true);
        admin = users.save(admin);
        log.info("Administrator account created (user {})", admin.getId());
        giveOwnerlessWorkTo(admin);
        return admin;
    }

    /** At start-up: projects and own symbols saved before they had owners go to the primary administrator (once there is one). */
    @EventListener(ApplicationReadyEvent.class)
    public void claimOwnerlessWork() {
        users.findByEmail(adminEmail).filter(AppUser::isAdmin).ifPresent(this::giveOwnerlessWorkTo);
    }

    private void giveOwnerlessWorkTo(AppUser admin) {
        int count = projects.assignOwnerless(admin.getId());
        if (count > 0) log.info("{} project(s) saved before accounts existed now belong to the administrator (user {})", count, admin.getId());
        int symbolCount = symbols.assignOwnerless(admin.getId());
        if (symbolCount > 0) log.info("{} own symbol(s) saved before symbols had owners now belong to the administrator (user {})", symbolCount, admin.getId());
    }

    /** True for the administrator of plugged.admin.email: that account always stays administrator and cannot be removed. */
    public boolean isPrimaryAdmin(AppUser user) {
        return user.isAdmin() && user.getEmail().equals(adminEmail);
    }

    /**
     * Makes an account administrator (also approving it) or an ordinary user again. {@code actingAdminId} is the administrator who asks: he
     * cannot take the role away from himself, and nobody takes it away from the primary administrator.
     */
    @Transactional
    public AppUser setAdmin(long actingAdminId, long id, boolean admin) {
        AppUser user = find(id);
        if (!admin && user.isAdmin()) {
            if (isPrimaryAdmin(user)) throw new LocalizedStatusException(HttpStatus.CONFLICT, "user.primaryAdmin");
            if (user.getId() == actingAdminId) throw new LocalizedStatusException(HttpStatus.CONFLICT, "user.cannotDemoteSelf");
        }
        if (user.isAdmin() != admin) log.info("User {} is {} now (by user {})", id, admin ? "administrator" : "an ordinary user", actingAdminId);
        user.setAdmin(admin);
        if (admin) user.setApproved(true);
        return user;
    }

    /** A new account, waiting for the approval of an administrator. */
    @Transactional
    public synchronized AppUser register(AuthRequests.Register request) {
        if (setupRequired()) throw new LocalizedStatusException(HttpStatus.CONFLICT, "auth.setupRequired");
        String email = request.email();
        if (users.existsByEmail(email)) throw new LocalizedStatusException(HttpStatus.CONFLICT, "auth.emailTaken");
        AppUser user = users.save(newUser(request.name(), request.surname(), email, request.password()));
        log.info("User {} registered, waiting for approval", user.getId());
        return user;
    }

    /**
     * The account with this email address and password. A locked account (too many wrong passwords) is refused even with the right
     * password; an unknown address is locked the same way (see LoginThrottle), so the answers do not tell which addresses have an account.
     * The password is checked before the approval, so "not approved yet" is only said to whoever knows the password. Runs in its own
     * transaction (noRollbackFor): a wrong password is counted even though the sign-in fails.
     */
    @Transactional(noRollbackFor = LocalizedStatusException.class)
    public AppUser authenticate(AuthRequests.Login request) {
        String email = request.email(), password = request.password();
        AppUser user = users.findByEmail(email).orElse(null);
        boolean matches = passwordEncoder.matches(password, user == null ? dummyHash : user.getPasswordHash());
        Instant now = throttle.now();
        if (user == null) {
            throttle.checkUnknownEmail(email);
            Instant lockedNow = throttle.recordUnknownEmail(email);
            log.info("Sign-in refused for {}: unknown address", forLog(email));
            if (lockedNow != null) throw throttle.locked(lockedNow);
            throw new LocalizedStatusException(HttpStatus.UNAUTHORIZED, "auth.badCredentials");
        }
        Instant lockedUntil = user.lockedUntil(now);
        if (lockedUntil != null) {
            log.info("Sign-in refused for {}: account locked until {}", forLog(email), lockedUntil);
            throw throttle.locked(lockedUntil);
        }
        if (!matches) {
            boolean lockedNow = user.recordFailedLogin(now, throttle.maxFailedLogins(), throttle.lockout());
            log.info("Sign-in refused for {}: wrong password{}", forLog(email), lockedNow ? "; account locked for " + throttle.lockout() : "");
            if (lockedNow) throw throttle.locked(user.lockedUntil(now));
            throw new LocalizedStatusException(HttpStatus.UNAUTHORIZED, "auth.badCredentials");
        }
        if (!user.isApproved()) {
            log.info("Sign-in refused for {}: not approved yet", forLog(email));
            throw new LocalizedStatusException(HttpStatus.FORBIDDEN, "auth.notApproved");
        }
        return user;
    }

    /** A successful sign-in of the account: its last sign-in is now and its count goes up. Answers the account as it is now. */
    @Transactional
    public AppUser recordLogin(long id) {
        AppUser user = find(id);
        user.recordLogin();
        return user;
    }

    /** The account that may still use its session: it exists and is approved. */
    public AppUser activeUser(long id) {
        return users.findById(id).filter(AppUser::isApproved).orElse(null);
    }

    public List<AppUser> all() {
        return users.findAllByOrderByApprovedAscIdAsc();
    }

    private AppUser find(long id) {
        return users.findById(id).orElseThrow(() -> new LocalizedStatusException(HttpStatus.NOT_FOUND, "user.notFound", id));
    }

    /** Opens an account that was locked after too many wrong passwords. */
    @Transactional
    public AppUser unlock(long id) {
        AppUser user = find(id);
        if (user.getLockedUntil() != null) log.info("User {} unlocked", id);
        user.unlock();
        return user;
    }

    @Transactional
    public AppUser approve(long id) {
        AppUser user = find(id);
        if (!user.isApproved()) {
            user.setApproved(true);
            log.info("User {} approved", id);
        }
        return user;
    }

    /**
     * Removes an account (also to turn down a registration). An administrator cannot be removed (make him an ordinary user first). The
     * projects of the account go to {@code actingAdminId}, the administrator who removes it; its group memberships end.
     */
    @Transactional
    public void delete(long actingAdminId, long id) {
        AppUser user = find(id);
        if (user.isAdmin()) throw new LocalizedStatusException(HttpStatus.CONFLICT, "user.adminCannotBeDeleted");
        int moved = projects.changeOwner(id, actingAdminId);
        int movedSymbols = symbols.changeOwner(id, actingAdminId);
        groups.removeOwnerEverywhere(id);
        groups.removeMemberEverywhere(id);
        users.delete(user);
        log.info("User {} deleted; {} project(s) and {} symbol(s) now belong to user {}", id, moved, movedSymbols, actingAdminId);
    }

    private AppUser newUser(String name, String surname, String email, String password) {
        return new AppUser(name, surname, email, passwordEncoder.encode(password));
    }

    /** An address someone typed, safe to put in a log line: no line breaks (that could fake log lines), not endlessly long. */
    static String forLog(String text) {
        if (text == null) return "";
        String clean = text.replaceAll("[\\p{Cntrl}]", "_");
        return clean.length() > AuthRequests.MAX_EMAIL_LENGTH ? clean.substring(0, AuthRequests.MAX_EMAIL_LENGTH) + "..." : clean;
    }

    static String normalizeEmail(String email) {
        return AuthRequests.normalizeEmail(email);
    }
}
