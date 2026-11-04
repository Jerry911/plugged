// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;

class LegacySocketColumnsTest {

    private static JdbcDataSource database(String... statements) throws SQLException {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            for (String sql : statements) statement.execute(sql);
        }
        return dataSource;
    }

    private static String row(JdbcDataSource dataSource, String key) throws SQLException {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT SOCK_N, SOCK_H FROM SYMBOLS WHERE K = '" + key + "'")) {
            result.next();
            return result.getObject(1) + " " + result.getObject(2);
        }
    }

    @Test
    void theValuesOfTheOldColumnsMoveToTheNewOnes_aValueAlreadyThereStays() throws SQLException {
        JdbcDataSource dataSource = database(
                "CREATE TABLE SYMBOLS (K VARCHAR(100) PRIMARY KEY, SOCKN INT, SOCKH BOOLEAN, SOCK_N INT, SOCK_H BOOLEAN)",
                "INSERT INTO SYMBOLS VALUES ('stopcontact2', 2, NULL, NULL, NULL)",
                "INSERT INTO SYMBOLS VALUES ('std:stopcontact3', 3, TRUE, NULL, NULL)",
                "INSERT INTO SYMBOLS VALUES ('saved', 2, NULL, 4, FALSE)",
                "INSERT INTO SYMBOLS VALUES ('lamp', NULL, NULL, NULL, NULL)");
        LegacySocketColumns columns = new LegacySocketColumns(dataSource);
        assertEquals(3, columns.migrate());
        assertEquals("2 null", row(dataSource, "stopcontact2"));
        assertEquals("3 true", row(dataSource, "std:stopcontact3"));
        assertEquals("4 false", row(dataSource, "saved"));
        assertEquals("null null", row(dataSource, "lamp"));
        // a second start has nothing left to copy
        assertEquals(0, columns.migrate());
    }

    @Test
    void aDatabaseWithoutTheOldColumnsIsLeftAlone() throws SQLException {
        JdbcDataSource dataSource = database("CREATE TABLE SYMBOLS (K VARCHAR(100) PRIMARY KEY, SOCK_N INT, SOCK_H BOOLEAN)",
                "INSERT INTO SYMBOLS VALUES ('stopcontact2', 2, NULL)");
        assertEquals(0, new LegacySocketColumns(dataSource).migrate());
        assertEquals("2 null", row(dataSource, "stopcontact2"));
        // only the old columns, no new ones yet: nothing to copy to
        assertEquals(0, new LegacySocketColumns(database("CREATE TABLE SYMBOLS (K VARCHAR(100) PRIMARY KEY, SOCKN INT, SOCKH BOOLEAN)")).migrate());
    }

    @Test
    void aBrokenDatabaseStopsTheStart() {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:x;IFEXISTS=TRUE");
        assertThrows(IllegalStateException.class, () -> new LegacySocketColumns(dataSource).migrate());
    }
}
