// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.ColumnDefault;

/**
 * A person who may sign in (table {@code users}). A new account is not approved: it can only sign in once an administrator has approved it.
 * The administrator account is created on the first start, with the address of plugged.admin.email, and is approved from the start.
 */
@Entity
@Table(name = "users")
public class AppUser {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 100)
    private String name;
    @Column(nullable = false, length = 100)
    private String surname;
    /** Always stored in lower case, so it is unique whatever the case it was typed in. */
    @Column(nullable = false, unique = true, length = 254)
    private String email;
    /** The password, hashed (bcrypt); never the password itself. */
    @Column(nullable = false, length = 100)
    private String passwordHash;
    @Column(nullable = false)
    private boolean admin = false;
    @Column(nullable = false)
    private boolean approved = false;
    /** Moment of the registration, ISO-8601. */
    @Column(length = 40)
    private String created;
    /** Moment of the last successful sign-in (also the first start of the administrator), ISO-8601; null = never signed in. */
    @Column(length = 40)
    private String lastLogin;
    /** How many times the account signed in. The column default lets an existing users table get the column. */
    @ColumnDefault("0")
    @Column(nullable = false)
    private int loginCount = 0;
    /** Goes up with every change of the password: the sessions signed in before it end (see PluggedPrincipal). */
    @ColumnDefault("0")
    @Column(nullable = false)
    private int credentialsVersion = 0;
    /** The password is a temporary one an administrator gave: it has to be changed before anything else. */
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean mustChangePassword = false;
    /** Wrong passwords in a row since the last successful sign-in (or the last lockout). */
    @ColumnDefault("0")
    @Column(nullable = false)
    private int failedLogins = 0;
    /** Moment until which the account cannot sign in after too many wrong passwords, ISO-8601; null = not locked. */
    @Column(length = 40)
    private String lockedUntil;

    protected AppUser() {
    }

    public AppUser(String name, String surname, String email, String passwordHash) {
        this.name = name;
        this.surname = surname;
        this.email = email;
        this.passwordHash = passwordHash;
        this.created = Instant.now().toString();
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getSurname() {
        return surname;
    }

    public String getEmail() {
        return email;
    }

    public int getCredentialsVersion() {
        return credentialsVersion;
    }

    public boolean isMustChangePassword() {
        return mustChangePassword;
    }

    /**
     * A new password ({@code temporary}: given by an administrator, to be changed at the next sign-in). The sessions signed in with the
     * old one end; a lockout is lifted.
     */
    public void changePassword(String newHash, boolean temporary) {
        passwordHash = newHash;
        mustChangePassword = temporary;
        credentialsVersion++;
        unlock();
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public boolean isAdmin() {
        return admin;
    }

    public void setAdmin(boolean admin) {
        this.admin = admin;
    }

    public boolean isApproved() {
        return approved;
    }

    public void setApproved(boolean approved) {
        this.approved = approved;
    }

    public String getCreated() {
        return created;
    }

    public String getLastLogin() {
        return lastLogin;
    }

    public int getLoginCount() {
        return loginCount;
    }

    /** A successful sign-in: now is the last one, and there is one more. The wrong attempts before it are forgotten. */
    public void recordLogin() {
        lastLogin = Instant.now().toString();
        loginCount++;
        failedLogins = 0;
        lockedUntil = null;
    }

    public int getFailedLogins() {
        return failedLogins;
    }

    /** The moment the lockout ends, or null when the account is not locked (any more) at {@code now}. */
    public Instant lockedUntil(Instant now) {
        if (lockedUntil == null) return null;
        Instant until = Instant.parse(lockedUntil);
        return until.isAfter(now) ? until : null;
    }

    public String getLockedUntil() {
        return lockedUntil;
    }

    /**
     * A wrong password at {@code now}: after {@code maxFailures} in a row the account is locked for {@code lockout}. Answers true when this
     * attempt locked it.
     */
    public boolean recordFailedLogin(Instant now, int maxFailures, java.time.Duration lockout) {
        if (lockedUntil != null && lockedUntil(now) == null) lockedUntil = null; // an expired lockout starts the count over
        if (++failedLogins < maxFailures) return false;
        failedLogins = 0;
        lockedUntil = now.plus(lockout).toString();
        return true;
    }

    /** The administrator opens a locked account again. */
    public void unlock() {
        failedLogins = 0;
        lockedUntil = null;
    }
}
