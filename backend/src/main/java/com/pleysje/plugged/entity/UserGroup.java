// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.ColumnDefault;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * A group of coworkers (table {@code user_groups}, members in {@code group_members}). A project shared with a group can be opened and saved by
 * every member. Only an administrator creates groups and decides who is in them; a user can be in several groups.
 * <p>
 * <b>Owners</b> ({@code group_owners}, always members too) are the teachers of a group: they can switch its <b>educational mode</b> on and
 * off. With it on, the members who are not owners (the students) cannot validate a schema, nor import or export one, in any of their
 * projects (see GroupService#isRestricted). Administrators are never restricted. Off by default.
 */
@Entity
@Table(name = "user_groups")
public class UserGroup {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true, length = 100)
    private String name;
    @Column(length = 40)
    private String created;
    @ManyToMany
    @JoinTable(name = "group_members", joinColumns = @JoinColumn(name = "group_id"), inverseJoinColumns = @JoinColumn(name = "user_id"))
    private Set<AppUser> members = new LinkedHashSet<>();
    @ManyToMany
    @JoinTable(name = "group_owners", joinColumns = @JoinColumn(name = "group_id"), inverseJoinColumns = @JoinColumn(name = "user_id"))
    private Set<AppUser> owners = new LinkedHashSet<>();
    /** Educational mode; the column default lets an existing user_groups table get the column. */
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean educational = false;

    protected UserGroup() {
    }

    public UserGroup(String name) {
        this.name = name;
        this.created = Instant.now().toString();
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCreated() {
        return created;
    }

    public Set<AppUser> getMembers() {
        return members;
    }

    public Set<AppUser> getOwners() {
        return owners;
    }

    public boolean isOwner(long userId) {
        return owners.stream().anyMatch(owner -> owner.getId() == userId);
    }

    public boolean isEducational() {
        return educational;
    }

    public void setEducational(boolean educational) {
        this.educational = educational;
    }
}
