// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.service;

import com.pleysje.plugged.catalog.StandardSymbols;
import com.pleysje.plugged.catalog.SymbolShapes;
import com.pleysje.plugged.dto.SymbolDto;
import com.pleysje.plugged.entity.SymbolEntity;
import com.pleysje.plugged.i18n.LocalizedStatusException;
import com.pleysje.plugged.repository.SymbolRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The symbol catalog: the standard symbols ({@link StandardSymbols}) plus the symbols of the user, stored in the database.
 * A standard symbol can be edited, deleted and restored to its standard drawing; a symbol of the user can be edited and deleted.
 * Errors are {@link LocalizedStatusException}s: their message is written in the language of the request.
 */
@Service
@Transactional
public class SymbolService {
    /** keys that are part of the URLs of the API */
    public static final List<String> RESERVED_KEYS = List.of("template", "restore");
    /** prefix of the hidden rows that hold the standard a user chose with {@link #makeStandard}; they never show up in the catalog */
    public static final String CHOSEN_STANDARD_PREFIX = "std:";
    /** prefix of the hidden marker rows that say a standard symbol was deleted by the user: seeding then leaves it out until it is restored */
    public static final String DELETED_MARKER_PREFIX = "del:";
    public static final int MAX_NAME_LENGTH = 120, MAX_CATEGORY_LENGTH = 60, MAX_SHAPES = 500, MAX_PARENTS = 500, MIN_SOCKETS = 1, MAX_SOCKETS = 20;
    private static final Pattern KEY_PATTERN = Pattern.compile("[A-Za-z0-9_.:-]{1,100}");
    /** sort order of the symbols of the user: after all standard symbols */
    private static final int CUSTOM_SORT_ORDER = 100_000;

    private final SymbolRepository repository;

    public SymbolService(SymbolRepository repository) {
        this.repository = repository;
    }

    /**
     * Makes sure the standard symbols are in the database: new ones are added, stored standard symbols of an older catalog version that were not edited
     * are replaced, and unedited ones that are no longer in the catalog are removed. A standard symbol the user deleted stays away until it is restored.
     */
    public void seed() {
        for (SymbolDto standard : StandardSymbols.all()) {
            if (repository.existsById(DELETED_MARKER_PREFIX + standard.key())) continue;
            SymbolEntity stored = repository.findById(standard.key()).orElse(null);
            SymbolDto current = standardOf(standard.key());
            // an unedited copy follows its standard: a new VERSION, or a drawing that changed (in the code or in the released drawings)
            boolean outdated = stored != null && stored.isBuiltin() && !stored.isModified()
                    && (stored.getStandardVersion() < StandardSymbols.VERSION || !stored.sameDefinition(SymbolMapper.toEntity(current)));
            if (stored == null || outdated) repository.save(asStandard(current));
        }
        // a standard symbol that left the catalog (e.g. the waterproof socket, now a property of the socket) disappears too, unless the user changed it
        for (SymbolEntity entity : repository.findAll()) {
            if (!isHidden(entity.getKey()) && entity.isBuiltin() && !entity.isModified() && StandardSymbols.find(entity.getKey()) == null) repository.delete(entity);
        }
    }

    @Transactional(readOnly = true)
    public List<SymbolDto> list() {
        return repository.findAll().stream()
                .filter(entity -> !isHidden(entity.getKey()))
                .sorted(Comparator.comparingInt(SymbolEntity::getSortOrder).thenComparing(SymbolEntity::getName, String.CASE_INSENSITIVE_ORDER))
                .map(SymbolMapper::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public SymbolDto get(String key) {
        return SymbolMapper.toDto(findVisible(key));
    }

    /** A new symbol of the user to start from: a fresh key and the default parents. */
    public SymbolDto template() {
        String key = "custom:" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        return new SymbolDto(key, "", SymbolMapper.DEFAULT_CATEGORY, StandardSymbols.ELEMENT_KEYS, true, List.of(), null, 0, false, false, false);
    }

    /** Creates or updates a symbol; for a standard symbol the result tells whether it still is the standard drawing. */
    public SymbolDto save(String key, SymbolDto symbol) {
        validate(key, symbol);
        SymbolEntity entity = SymbolMapper.toEntity(
                new SymbolDto(key, symbol.name(), symbol.category(), symbol.parents(), symbol.placeable(), symbol.shapes(), symbol.socket(), 0, false, false, symbol.details()));
        SymbolDto standard = standardOf(key);
        if (standard != null) {
            SymbolEntity stored = repository.findById(key).orElse(null);
            repository.findById(DELETED_MARKER_PREFIX + key).ifPresent(repository::delete);
            entity.setBuiltin(true);
            entity.setStandardVersion(stored != null ? stored.getStandardVersion() : StandardSymbols.VERSION);
            entity.setSortOrder(StandardSymbols.orderOf(key));
            entity.setModified(!entity.sameDefinition(SymbolMapper.toEntity(standard)));
        } else {
            entity.setSortOrder(CUSTOM_SORT_ORDER);
        }
        return SymbolMapper.toDto(repository.save(entity));
    }

    /** Deletes a symbol. A standard symbol leaves a hidden marker so that it does not come back at the next start; restore brings it back. */
    public void delete(String key) {
        SymbolEntity entity = findVisible(key);
        repository.delete(entity);
        if (entity.isBuiltin()) {
            SymbolEntity marker = SymbolMapper.toEntity(
                    new SymbolDto(DELETED_MARKER_PREFIX + key, entity.getName(), entity.getCategory(), List.of(), false, List.of(), null, 0, false, false, false));
            marker.setSortOrder(CUSTOM_SORT_ORDER);
            repository.save(marker);
        }
    }

    /**
     * The current definition of a standard symbol becomes its standard: restore, restore-all and the seeding then go back to this drawing.
     * It is kept in a hidden row (key "std:" + key); the symbol itself is no longer marked as modified.
     */
    public SymbolDto makeStandard(String key) {
        SymbolEntity stored = findVisible(key);
        if (StandardSymbols.find(key) == null) throw new LocalizedStatusException(HttpStatus.CONFLICT, "symbol.onlyStandardCanBecomeStandard", key);
        SymbolDto current = SymbolMapper.toDto(stored);
        SymbolEntity chosen = SymbolMapper.toEntity(new SymbolDto(CHOSEN_STANDARD_PREFIX + key, current.name(), current.category(), current.parents(), current.placeable(),
                current.shapes(), current.socket(), 0, false, false, current.details()));
        chosen.setSortOrder(CUSTOM_SORT_ORDER);
        repository.save(chosen);
        stored.setModified(false);
        return SymbolMapper.toDto(repository.save(stored));
    }

    /**
     * The catalog to ship with the next release (the file {@link StandardSymbols#CATALOG}): every standard symbol, in catalog order, with
     * its standard as it is now in this installation, i.e. the drawing chosen with "make standard", else the one of the catalog. Edits that
     * were not made the standard, deleted standard symbols and the symbols of the users do not change it.
     */
    @Transactional(readOnly = true)
    public List<SymbolDto> catalog() {
        List<SymbolDto> catalog = new java.util.ArrayList<>();
        for (SymbolDto shipped : StandardSymbols.all()) catalog.add(standardOf(shipped.key()));
        return catalog;
    }

    /** The standard symbols whose standard in this installation differs from the shipped catalog: what the next release would change. */
    @Transactional(readOnly = true)
    public List<SymbolDto> catalogChanges() {
        return catalog().stream()
                .filter(standard -> !SymbolMapper.toEntity(standard).sameDefinition(SymbolMapper.toEntity(StandardSymbols.find(standard.key()))))
                .toList();
    }

    /** Puts a standard symbol back to its standard drawing (also when the user changed or deleted it). */
    public SymbolDto restore(String key) {
        if (isHidden(key)) throw notFound(key);
        SymbolDto standard = standardOf(key);
        if (standard == null) {
            if (repository.existsById(key)) throw new LocalizedStatusException(HttpStatus.CONFLICT, "symbol.ownHasNoStandard", key);
            throw notFound(key);
        }
        repository.findById(DELETED_MARKER_PREFIX + key).ifPresent(repository::delete);
        return SymbolMapper.toDto(repository.save(asStandard(standard)));
    }

    /** Puts all standard symbols back to their standard drawings, also the deleted ones; the symbols of the user are left alone. */
    public List<SymbolDto> restoreAll() {
        for (SymbolDto standard : StandardSymbols.all()) {
            repository.findById(DELETED_MARKER_PREFIX + standard.key()).ifPresent(repository::delete);
            repository.save(asStandard(standardOf(standard.key())));
        }
        return list();
    }

    /** The stored symbol with this key; hidden rows are not found. */
    private SymbolEntity findVisible(String key) {
        if (isHidden(key)) throw notFound(key);
        return repository.findById(key).orElseThrow(() -> notFound(key));
    }

    /** The standard definition of a symbol: the one the user chose with {@link #makeStandard}, else the one of the catalog; null for a symbol that is not a standard symbol. */
    private SymbolDto standardOf(String key) {
        SymbolDto catalog = StandardSymbols.find(key);
        if (catalog == null) return null;
        return repository.findById(CHOSEN_STANDARD_PREFIX + key)
                .map(chosenRow -> {
                    SymbolDto chosen = SymbolMapper.toDto(chosenRow);
                    return new SymbolDto(key, chosen.name(), chosen.category(), chosen.parents(), chosen.placeable(), chosen.shapes(), chosen.socket(),
                            catalog.version(), true, false, chosen.details());
                })
                .orElse(catalog);
    }

    /** the hidden rows (chosen standards and deletion markers) never show up in the catalog */
    private static boolean isHidden(String key) {
        return key != null && (key.startsWith(CHOSEN_STANDARD_PREFIX) || key.startsWith(DELETED_MARKER_PREFIX));
    }

    private static SymbolEntity asStandard(SymbolDto standard) {
        SymbolEntity entity = SymbolMapper.toEntity(standard);
        entity.setBuiltin(true);
        entity.setModified(false);
        entity.setStandardVersion(StandardSymbols.VERSION);
        entity.setSortOrder(StandardSymbols.orderOf(standard.key()));
        return entity;
    }

    private static LocalizedStatusException notFound(String key) {
        return new LocalizedStatusException(HttpStatus.NOT_FOUND, "symbol.notFound", key);
    }

    private static LocalizedStatusException badRequest(String messageKey, Object... arguments) {
        return new LocalizedStatusException(HttpStatus.BAD_REQUEST, messageKey, arguments);
    }

    public static boolean isValidKey(String key) {
        return key != null && KEY_PATTERN.matcher(key).matches() && !RESERVED_KEYS.contains(key) && !isHidden(key);
    }

    /** @throws LocalizedStatusException 400 with the reason when the symbol cannot be stored */
    public static void validate(String key, SymbolDto symbol) {
        if (symbol == null) throw badRequest("symbol.missing");
        if (!isValidKey(key)) throw badRequest("symbol.invalidKey", key);
        if (symbol.key() != null && !symbol.key().equals(key)) throw badRequest("symbol.keyMismatch");
        if (symbol.name() == null || symbol.name().isBlank()) throw badRequest("symbol.nameRequired");
        if (symbol.name().trim().length() > MAX_NAME_LENGTH) throw badRequest("symbol.nameTooLong", MAX_NAME_LENGTH);
        if (symbol.category() != null && symbol.category().trim().length() > MAX_CATEGORY_LENGTH) throw badRequest("symbol.categoryTooLong", MAX_CATEGORY_LENGTH);
        if (symbol.shapes() == null || symbol.shapes().isEmpty()) throw badRequest("symbol.shapeRequired");
        if (symbol.shapes().size() > MAX_SHAPES) throw badRequest("symbol.tooManyShapes", MAX_SHAPES);
        for (Map<String, Object> shape : symbol.shapes()) {
            MessageSourceResolvable problem = SymbolShapes.problem(shape);
            if (problem != null) throw badRequest("symbol.invalidShape", problem);
        }
        if (symbol.parents() != null) {
            if (symbol.parents().size() > MAX_PARENTS) throw badRequest("symbol.tooManyParents", MAX_PARENTS);
            for (String parent : symbol.parents()) {
                if (parent == null || !KEY_PATTERN.matcher(parent).matches()) throw badRequest("symbol.invalidParent", String.valueOf(parent));
            }
        }
        Object socketCount = symbol.socket() == null ? null : symbol.socket().get("n");
        if (socketCount != null && !(socketCount instanceof Number count && count.intValue() >= MIN_SOCKETS && count.intValue() <= MAX_SOCKETS)) {
            throw badRequest("symbol.socketCount", MIN_SOCKETS, MAX_SOCKETS);
        }
    }
}
