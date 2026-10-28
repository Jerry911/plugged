// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The symbol catalog: the standard symbols ({@link StandardSymbols}) plus the symbols of the user, stored in the database.
 * A standard symbol can be edited, deleted and restored to its standard drawing; a symbol of the user can be edited and deleted.
 */
@Service
@Transactional
public class SymbolService {
    /** keys that are part of the URLs of the API */
    static final List<String> RESERVED = List.of("template", "restore");
    /** prefix of the hidden rows that hold the standard a user chose with {@link #makeStandard}; they never show up in the catalog */
    static final String BASE = "std:";
    /** prefix of the hidden marker rows that say a standard symbol was deleted by the user: seeding then leaves it out until it is restored */
    static final String GONE = "del:";
    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9_.:-]{1,100}");
    private static final int MAX_SHAPES = 500, MAX_PARENTS = 500, CUSTOM_ORDER = 100_000;

    private final SymbolRepo repo;

    public SymbolService(SymbolRepo repo) {
        this.repo = repo;
    }

    /**
     * Makes sure the standard symbols are in the database: new ones are added, stored standard symbols of an older catalog version that were not edited
     * are replaced, and unedited ones that are no longer in the catalog are removed. A standard symbol the user deleted stays away until it is restored.
     */
    public void seed() {
        for (SymbolDto std : StandardSymbols.all()) {
            if (repo.existsById(GONE + std.k())) continue;
            SymbolEntity cur = repo.findById(std.k()).orElse(null);
            if (cur == null || (cur.isBuiltin() && !cur.isModified() && cur.getStdVersion() < StandardSymbols.VERSION)) repo.save(fresh(standardOf(std.k())));
        }
        // a standard symbol that left the catalog (e.g. the waterproof socket, now a property of the socket) disappears too, unless the user changed it
        for (SymbolEntity e : repo.findAll())
            if (!isHidden(e.getK()) && e.isBuiltin() && !e.isModified() && StandardSymbols.find(e.getK()) == null) repo.delete(e);
    }

    @Transactional(readOnly = true)
    public List<SymbolDto> list() {
        return repo.findAll().stream()
                .filter(e -> !isHidden(e.getK()))
                .sorted(Comparator.comparingInt(SymbolEntity::getSortOrder).thenComparing(SymbolEntity::getName, String.CASE_INSENSITIVE_ORDER))
                .map(SymbolMapper::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public SymbolDto get(String k) {
        if (isHidden(k)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k);
        return SymbolMapper.toDto(repo.findById(k).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k)));
    }

    /** A new symbol of the user to start from: a fresh key and the default parents. */
    public SymbolDto template() {
        return new SymbolDto("custom:" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), "", SymbolMapper.DEFAULT_CATEGORY,
                StandardSymbols.ELEMENT_KEYS, true, List.of(), null, 0, false, false, false);
    }

    /** Creates or updates a symbol; for a standard symbol the result tells whether it still is the standard drawing. */
    public SymbolDto save(String k, SymbolDto in) {
        validate(k, in);
        SymbolEntity e = SymbolMapper.toEntity(new SymbolDto(k, in.name(), in.cat(), in.parents(), in.place(), in.shapes(), in.sock(), 0, false, false, in.details()));
        SymbolDto std = standardOf(k);
        SymbolEntity cur = repo.findById(k).orElse(null);
        if (std != null) {
            repo.findById(GONE + k).ifPresent(repo::delete);
            e.setBuiltin(true);
            e.setStdVersion(cur != null ? cur.getStdVersion() : StandardSymbols.VERSION);
            e.setSortOrder(StandardSymbols.orderOf(k));
            e.setModified(!e.sameDefinition(SymbolMapper.toEntity(std)));
        } else {
            e.setSortOrder(CUSTOM_ORDER);
        }
        return SymbolMapper.toDto(repo.save(e));
    }

    /** Deletes a symbol. A standard symbol leaves a hidden marker so that it does not come back at the next start; restore brings it back. */
    public void delete(String k) {
        if (isHidden(k)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k);
        SymbolEntity e = repo.findById(k).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k));
        repo.delete(e);
        if (e.isBuiltin()) {
            SymbolEntity gone = SymbolMapper.toEntity(new SymbolDto(GONE + k, e.getName(), e.getCategory(), List.of(), false, List.of(), null, 0, false, false, false));
            gone.setSortOrder(CUSTOM_ORDER);
            repo.save(gone);
        }
    }

    /**
     * The current definition of a standard symbol becomes its standard: restore, restore-all and the seeding then go back to this drawing.
     * It is kept in a hidden row (key "std:" + k); the symbol itself is no longer marked as modified.
     */
    public SymbolDto makeStandard(String k) {
        if (isHidden(k)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k);
        SymbolEntity cur = repo.findById(k).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k));
        if (StandardSymbols.find(k) == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Alleen een standaardsymbool kan de nieuwe standaard worden: " + k);
        SymbolDto d = SymbolMapper.toDto(cur);
        SymbolEntity base = SymbolMapper.toEntity(new SymbolDto(BASE + k, d.name(), d.cat(), d.parents(), d.place(), d.shapes(), d.sock(), 0, false, false, d.details()));
        base.setSortOrder(CUSTOM_ORDER);
        repo.save(base);
        cur.setModified(false);
        return SymbolMapper.toDto(repo.save(cur));
    }

    /** The standard definition of a symbol: the one the user chose with {@link #makeStandard}, else the one of the catalog; null for a symbol that is not a standard symbol. */
    private SymbolDto standardOf(String k) {
        SymbolDto std = StandardSymbols.find(k);
        if (std == null) return null;
        return repo.findById(BASE + k)
                .map(b -> {
                    SymbolDto d = SymbolMapper.toDto(b);
                    return new SymbolDto(k, d.name(), d.cat(), d.parents(), d.place(), d.shapes(), d.sock(), std.v(), true, false, d.details());
                })
                .orElse(std);
    }

    private static boolean isBase(String k) {
        return k != null && k.startsWith(BASE);
    }

    private static boolean isGone(String k) {
        return k != null && k.startsWith(GONE);
    }

    /** the hidden rows (chosen standards and deletion markers) never show up in the catalog */
    private static boolean isHidden(String k) {
        return isBase(k) || isGone(k);
    }

    /** Puts a standard symbol back to its standard drawing (also when the user changed or deleted it). */
    public SymbolDto restore(String k) {
        if (isHidden(k)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k);
        SymbolDto std = standardOf(k);
        if (std == null) {
            if (repo.existsById(k)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Een eigen symbool heeft geen standaardtekening: " + k);
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k);
        }
        repo.findById(GONE + k).ifPresent(repo::delete);
        return SymbolMapper.toDto(repo.save(fresh(std)));
    }

    /** Puts all standard symbols back to their standard drawings, also the deleted ones; the symbols of the user are left alone. */
    public List<SymbolDto> restoreAll() {
        for (SymbolDto std : StandardSymbols.all()) {
            repo.findById(GONE + std.k()).ifPresent(repo::delete);
            repo.save(fresh(standardOf(std.k())));
        }
        return list();
    }

    private static SymbolEntity fresh(SymbolDto std) {
        SymbolEntity e = SymbolMapper.toEntity(std);
        e.setBuiltin(true);
        e.setModified(false);
        e.setStdVersion(StandardSymbols.VERSION);
        e.setSortOrder(StandardSymbols.orderOf(std.k()));
        return e;
    }

    private static ResponseStatusException bad(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }

    static boolean validKey(String k) {
        return k != null && KEY.matcher(k).matches() && !RESERVED.contains(k) && !isHidden(k);
    }

    /** @throws ResponseStatusException 400 with the reason when the symbol cannot be stored */
    static void validate(String k, SymbolDto d) {
        if (d == null) throw bad("Geen symbool meegegeven");
        if (!validKey(k)) throw bad("Ongeldige sleutel: " + k);
        if (d.k() != null && !d.k().equals(k)) throw bad("De sleutel in het symbool komt niet overeen met de URL");
        if (d.name() == null || d.name().isBlank()) throw bad("Geef het symbool een naam");
        if (d.name().trim().length() > 120) throw bad("De naam is te lang (max. 120 tekens)");
        if (d.cat() != null && d.cat().trim().length() > 60) throw bad("De categorie is te lang (max. 60 tekens)");
        if (d.shapes() == null || d.shapes().isEmpty()) throw bad("Teken minstens één vorm");
        if (d.shapes().size() > MAX_SHAPES) throw bad("Te veel vormen (max. " + MAX_SHAPES + ")");
        for (Map<String, Object> m : d.shapes()) {
            String problem = SymbolShapes.problem(m);
            if (problem != null) throw bad("Ongeldige vorm: " + problem);
        }
        if (d.parents() != null) {
            if (d.parents().size() > MAX_PARENTS) throw bad("Te veel 'mag hangen onder'-symbolen (max. " + MAX_PARENTS + ")");
            for (String p : d.parents()) if (p == null || !KEY.matcher(p).matches()) throw bad("Ongeldige sleutel bij 'mag hangen onder': " + p);
        }
        if (d.sock() != null && d.sock().get("n") != null && !(d.sock().get("n") instanceof Number n && n.intValue() >= 1 && n.intValue() <= 20)) {
            throw bad("Het aantal stopcontacten moet tussen 1 en 20 liggen");
        }
    }
}