// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

/**
 * A symbol of the catalog as exchanged with the frontend. The JSON field names are the short ones the drawing code and the stored projects use.
 * The constraints are checked with Bean Validation (see {@link com.pleysje.plugged.i18n.Violations}); what they cannot express (the key,
 * the shapes themselves, the number of sockets) is checked by SymbolService#validate.
 *
 * @param key       ({@code k}) unique key; the symbols of the users are "custom:..."
 * @param name      display name (trimmed)
 * @param category  ({@code cat}) category in the catalog browser (trimmed)
 * @param parents   keys of the symbols this symbol may hang under
 * @param placeable ({@code place}) can be placed on the situatieschema
 * @param shapes    drawing on a 24x24 grid, the connection point is on the line y = 12 (see {@link com.pleysje.plugged.catalog.SymbolShapes})
 * @param socket    ({@code sock}) optional socket parameters (pe, kid, h, n) from which the frontend can draw stacked sockets
 * @param version   ({@code v}) catalog version of a standard symbol
 * @param builtin   a standard symbol
 * @param modified  a standard symbol that differs from its standard definition (output only, ignored on input)
 * @param details   the element has the extended details input (brand, type, serial number, ...): inverter, solar panels, battery, EV charger
 * @param group     the id of the group the symbol belongs to (its members use it); null = a personal symbol of the user, or a standard symbol
 * @param editable  output only: the signed-in user may change and delete it (his own symbols, the symbols of his groups when he is no student
 *                  in educational mode, the standard symbols for an administrator)
 */
public record SymbolDto(
        @JsonProperty("k") String key,
        @NotBlank(message = "symbol.nameRequired") @Size(max = SymbolDto.MAX_NAME_LENGTH, message = "symbol.nameTooLong") String name,
        @JsonProperty("cat") @Size(max = SymbolDto.MAX_CATEGORY_LENGTH, message = "symbol.categoryTooLong") String category,
        @Size(max = SymbolDto.MAX_PARENTS, message = "symbol.tooManyParents")
        List<@NotNull(message = "symbol.invalidParent") @Pattern(regexp = SymbolDto.KEY_PATTERN, message = "symbol.invalidParent") String> parents,
        @JsonProperty("place") Boolean placeable,
        @NotEmpty(message = "symbol.shapeRequired") @Size(max = SymbolDto.MAX_SHAPES, message = "symbol.tooManyShapes") List<Map<String, Object>> shapes,
        @JsonProperty("sock") Map<String, Object> socket,
        @JsonProperty("v") Integer version,
        Boolean builtin,
        Boolean modified,
        Boolean details,
        Long group,
        Boolean editable) {
    public static final int MAX_NAME_LENGTH = 120, MAX_CATEGORY_LENGTH = 60, MAX_SHAPES = 500, MAX_PARENTS = 500;
    public static final String KEY_PATTERN = "[A-Za-z0-9_.:-]{1,100}";

    public SymbolDto {
        name = name == null ? null : name.trim();
        category = category == null ? null : category.trim();
    }

    /** A symbol without owner information (the standard catalog, new definitions). */
    public SymbolDto(String key, String name, String category, List<String> parents, Boolean placeable, List<Map<String, Object>> shapes,
                     Map<String, Object> socket, Integer version, Boolean builtin, Boolean modified, Boolean details) {
        this(key, name, category, parents, placeable, shapes, socket, version, builtin, modified, details, null, null);
    }

    /** The same symbol with the group it belongs to and whether the signed-in user may change it. */
    public SymbolDto withAccess(Long groupId, boolean canEdit) {
        return new SymbolDto(key, name, category, parents, placeable, shapes, socket, version, builtin, modified, details, groupId, canEdit);
    }
}
