// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import java.util.List;
import java.util.Map;

/**
 * A symbol of the catalog as exchanged with the frontend (JSON field names are the ones the drawing code uses).
 * <ul>
 *   <li>{@code k} unique key, {@code name} display name, {@code cat} category in the catalog browser</li>
 *   <li>{@code parents} keys of the symbols this symbol may hang under, {@code place} placeable on the situatieschema</li>
 *   <li>{@code shapes} drawing on a 24x24 grid, the connection point is on the line y = 12 (see {@link SymbolShapes})</li>
 *   <li>{@code sock} optional socket parameters (pe, kid, h, n) from which the frontend can draw stacked sockets</li>
 *   <li>{@code v} catalog version of a standard symbol, {@code builtin} is a standard symbol,
 *       {@code modified} a standard symbol that differs from its standard definition (output only, ignored on input)</li>
 * </ul>
 */
public record SymbolDto(
        String k,
        String name,
        String cat,
        List<String> parents,
        Boolean place,
        List<Map<String, Object>> shapes,
        Map<String, Object> sock,
        Integer v,
        Boolean builtin,
        Boolean modified) {
}
