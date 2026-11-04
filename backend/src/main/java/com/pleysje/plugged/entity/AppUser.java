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

    /** A successful sign-in: now is the last one, and there is one more. */
    public void recordLogin() {
        lastLogin = Instant.now().toString();
        loginCount++;
    }
}
