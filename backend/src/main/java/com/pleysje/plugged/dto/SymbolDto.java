// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

/**
 * A symbol of the catalog as exchanged with the frontend. The JSON field names are the short ones the drawing code and the stored projects use.
 *
 * @param key       ({@code k}) unique key; the symbols of the user are "custom:..."
 * @param name      display name
 * @param category  ({@code cat}) category in the catalog browser
 * @param parents   keys of the symbols this symbol may hang under
 * @param placeable ({@code place}) can be placed on the situatieschema
 * @param shapes    drawing on a 24x24 grid, the connection point is on the line y = 12 (see {@link com.pleysje.plugged.catalog.SymbolShapes})
 * @param socket    ({@code sock}) optional socket parameters (pe, kid, h, n) from which the frontend can draw stacked sockets
 * @param version   ({@code v}) catalog version of a standard symbol
 * @param builtin   a standard symbol
 * @param modified  a standard symbol that differs from its standard definition (output only, ignored on input)
 * @param details   the element has the extended details input (brand, type, serial number, ...): inverter, solar panels, battery, EV charger
 */
public record SymbolDto(
        @JsonProperty("k") String key,
        String name,
        @JsonProperty("cat") String category,
        List<String> parents,
        @JsonProperty("place") Boolean placeable,
        List<Map<String, Object>> shapes,
        @JsonProperty("sock") Map<String, Object> socket,
        @JsonProperty("v") Integer version,
        Boolean builtin,
        Boolean modified,
        Boolean details) {
}
