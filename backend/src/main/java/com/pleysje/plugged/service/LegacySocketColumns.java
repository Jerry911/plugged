// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Older versions stored the number of sockets and "waterproof" of a socket symbol in the columns SOCKN and SOCKH; the application now uses
 * SOCK_N and SOCK_H. Hibernate (ddl-auto=update) added the new columns but left the values in the old ones, so a double socket of such a
 * database read as one socket. At start-up the values are copied to the new columns where those are still empty; the old columns are left
 * alone (an older version of the application can still use them). Runs before the standard symbols are seeded (see {@link SymbolSeeder}).
 */
@Component
public class LegacySocketColumns {
    private static final Logger log = LoggerFactory.getLogger(LegacySocketColumns.class);
    /** old column → current column */
    static final String[][] RENAMED = {{"SOCKN", "SOCK_N"}, {"SOCKH", "SOCK_H"}};

    private final DataSource dataSource;

    public LegacySocketColumns(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    /** Copies the values of the old columns; returns the number of values copied. */
    public int migrate() {
        int copied = 0;
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            for (String[] columns : RENAMED) {
                if (!hasColumn(connection, columns[0]) || !hasColumn(connection, columns[1])) continue;
                int rows = statement.executeUpdate("UPDATE SYMBOLS SET " + columns[1] + " = " + columns[0]
                        + " WHERE " + columns[1] + " IS NULL AND " + columns[0] + " IS NOT NULL");
                if (rows > 0) log.info("Symbols: copied {} value(s) of the old column {} to {}", rows, columns[0], columns[1]);
                copied += rows;
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("The old socket columns of the symbols cannot be copied", exception);
        }
        return copied;
    }

    private static boolean hasColumn(Connection connection, String column) throws SQLException {
        try (ResultSet columns = connection.getMetaData().getColumns(null, null, "SYMBOLS", column)) {
            return columns.next();
        }
    }
}
