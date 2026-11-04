// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.security;

import com.pleysje.plugged.dto.AuthRequests;
import com.pleysje.plugged.entity.AppUser;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.repository.ProjectRepository;
import com.pleysje.plugged.repository.UserGroupRepository;
import com.pleysje.plugged.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
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
 *   <li>Projects saved before accounts existed belong to the primary administrator; the projects of a removed account go to the
 *       administrator who removed it.</li>
 * </ul>
 */
@Service
public class UserService {
    private static final Logger log = LoggerFactory.getLogger(UserService.class);
    public static final int MAX_NAME_LENGTH = 100;
    public static final int MAX_EMAIL_LENGTH = 254;
    public static final int MIN_PASSWORD_LENGTH = 8;
    /** bcrypt only looks at the first 72 bytes of a password: a longer one is refused instead of being cut silently. */
    public static final int MAX_PASSWORD_BYTES = 72;
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private final UserRepository users;
    private final ProjectRepository projects;
    private final UserGroupRepository groups;
    private final PasswordEncoder passwordEncoder;
    private final String adminEmail;
    /** Compared with when the email address is unknown, so a wrong address takes as long as a wrong password. */
    private final String dummyHash;

    public UserService(UserRepository users, ProjectRepository projects, UserGroupRepository groups, PasswordEncoder passwordEncoder,
                       @Value("${plugged.admin.email:}") String adminEmail) {
        this.users = users;
        this.projects = projects;
        this.groups = groups;
        this.passwordEncoder = passwordEncoder;
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
        giveOwnerlessProjectsTo(admin);
        return admin;
    }

    /** At start-up: projects saved before accounts existed go to the primary administrator (once there is one). */
    @EventListener(ApplicationReadyEvent.class)
    public void claimOwnerlessProjects() {
        users.findByEmail(adminEmail).filter(AppUser::isAdmin).ifPresent(this::giveOwnerlessProjectsTo);
    }

    private void giveOwnerlessProjectsTo(AppUser admin) {
        int count = projects.assignOwnerless(admin.getId());
        if (count > 0) log.info("{} project(s) saved before accounts existed now belong to the administrator (user {})", count, admin.getId());
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
        String email = validEmail(request.email());
        if (users.existsByEmail(email)) throw new LocalizedStatusException(HttpStatus.CONFLICT, "auth.emailTaken");
        AppUser user = users.save(newUser(request.name(), request.surname(), email, request.password()));
        log.info("User {} registered, waiting for approval", user.getId());
        return user;
    }

    /**
     * The account with this email address and password. The password is checked before the approval, so "not approved yet" is only said to
     * whoever knows the password.
     */
    public AppUser authenticate(AuthRequests.Login request) {
        String email = normalizeEmail(request.email()), password = request.password() == null ? "" : request.password();
        AppUser user = users.findByEmail(email).orElse(null);
        boolean matches = passwordEncoder.matches(password, user == null ? dummyHash : user.getPasswordHash());
        if (user == null || !matches) {
            log.info("Sign-in refused for {}: {}", forLog(email), user == null ? "unknown address" : "wrong password");
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
        groups.removeMemberEverywhere(id);
        users.delete(user);
        log.info("User {} deleted; {} project(s) now belong to user {}", id, moved, actingAdminId);
    }

    private AppUser newUser(String name, String surname, String email, String password) {
        return new AppUser(validName(name, "auth.nameRequired"), validName(surname, "auth.surnameRequired"), email, passwordEncoder.encode(validPassword(password)));
    }

    private static String validName(String value, String requiredKey) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, requiredKey);
        if (trimmed.length() > MAX_NAME_LENGTH) throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "auth.nameTooLong", MAX_NAME_LENGTH);
        return trimmed;
    }

    private static String validEmail(String value) {
        String email = normalizeEmail(value);
        if (email.length() > MAX_EMAIL_LENGTH || !EMAIL.matcher(email).matches()) throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "auth.invalidEmail");
        return email;
    }

    private static String validPassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH)
            throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "auth.passwordTooShort", MIN_PASSWORD_LENGTH);
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES)
            throw new LocalizedStatusException(HttpStatus.BAD_REQUEST, "auth.passwordTooLong", MAX_PASSWORD_BYTES);
        return password;
    }

    /** An address someone typed, safe to put in a log line: no line breaks (that could fake log lines), not endlessly long. */
    static String forLog(String text) {
        String clean = text.replaceAll("[\\p{Cntrl}]", "_");
        return clean.length() > MAX_EMAIL_LENGTH ? clean.substring(0, MAX_EMAIL_LENGTH) + "..." : clean;
    }

    static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
