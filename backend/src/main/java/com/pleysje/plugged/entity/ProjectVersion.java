// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;

/**
 * One saved version of a project (its history): the document as it was saved as version {@code version}, when and by whom. The newest
 * plugged.project-history versions of every project are kept (see ProjectHistory).
 */
@Entity
@Table(name = "project_versions", indexes = @Index(name = "project_versions_project", columnList = "project_id, version"))
public class ProjectVersion {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "project_version_ids")
    @SequenceGenerator(name = "project_version_ids", sequenceName = "project_versions_seq", allocationSize = 20)
    private Long id;
    @Column(name = "project_id", nullable = false)
    private long projectId;
    @Column(nullable = false)
    private long version;
    @Lob
    @Column(length = 10_000_000, nullable = false)
    private String json;
    private String name;
    @Column(length = 40, nullable = false)
    private String savedAt;
    private Long savedBy;

    protected ProjectVersion() {
    }

    public ProjectVersion(long projectId, long version, String json, String name, Long savedBy) {
        this.projectId = projectId;
        this.version = version;
        this.json = json;
        this.name = name;
        this.savedBy = savedBy;
        this.savedAt = java.time.Instant.now().toString();
    }

    public Long getId() { return id; }
    public long getProjectId() { return projectId; }
    public long getVersion() { return version; }
    public String getJson() { return json; }
    public String getName() { return name; }
    public String getSavedAt() { return savedAt; }
    public Long getSavedBy() { return savedBy; }
}
