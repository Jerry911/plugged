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
 * A standard symbol can be edited and restored to its standard drawing; a symbol of the user can be edited and deleted.
 */
@Service
@Transactional
public class SymbolService {
    /** keys that are part of the URLs of the API */
    static final List<String> RESERVED = List.of("template", "restore");
    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9_.:-]{1,100}");
    private static final int MAX_SHAPES = 500, MAX_PARENTS = 500, CUSTOM_ORDER = 100_000;

    private final SymbolRepo repo;

    public SymbolService(SymbolRepo repo) {
        this.repo = repo;
    }

    /** Makes sure the standard symbols are in the database: new ones are added, stored standard symbols of an older catalog version that were not edited are replaced. */
    public void seed() {
        for (SymbolDto std : StandardSymbols.all()) {
            SymbolEntity cur = repo.findById(std.k()).orElse(null);
            if (cur == null || (cur.isBuiltin() && !cur.isModified() && cur.getStdVersion() < StandardSymbols.VERSION)) repo.save(fresh(std));
        }
    }

    @Transactional(readOnly = true)
    public List<SymbolDto> list() {
        return repo.findAll().stream()
                .sorted(Comparator.comparingInt(SymbolEntity::getSortOrder).thenComparing(SymbolEntity::getName, String.CASE_INSENSITIVE_ORDER))
                .map(SymbolMapper::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public SymbolDto get(String k) {
        return SymbolMapper.toDto(repo.findById(k).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k)));
    }

    /** A new symbol of the user to start from: a fresh key and the default parents. */
    public SymbolDto template() {
        return new SymbolDto("custom:" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), "", SymbolMapper.DEFAULT_CATEGORY,
                StandardSymbols.ELEMENT_KEYS, true, List.of(), null, 0, false, false);
    }

    /** Creates or updates a symbol; for a standard symbol the result tells whether it still is the standard drawing. */
    public SymbolDto save(String k, SymbolDto in) {
        validate(k, in);
        SymbolEntity e = SymbolMapper.toEntity(new SymbolDto(k, in.name(), in.cat(), in.parents(), in.place(), in.shapes(), in.sock(), 0, false, false));
        SymbolDto std = StandardSymbols.find(k);
        SymbolEntity cur = repo.findById(k).orElse(null);
        if (std != null) {
            e.setBuiltin(true);
            e.setStdVersion(cur != null ? cur.getStdVersion() : StandardSymbols.VERSION);
            e.setSortOrder(StandardSymbols.orderOf(k));
            e.setModified(!e.sameDefinition(SymbolMapper.toEntity(std)));
        } else {
            e.setSortOrder(CUSTOM_ORDER);
        }
        return SymbolMapper.toDto(repo.save(e));
    }

    public void delete(String k) {
        SymbolEntity e = repo.findById(k).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k));
        if (e.isBuiltin()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Een standaardsymbool kan niet verwijderd worden, wel hersteld");
        repo.delete(e);
    }

    /** Puts a standard symbol back to its standard drawing (also when the user changed or deleted it in the database). */
    public SymbolDto restore(String k) {
        SymbolDto std = StandardSymbols.find(k);
        if (std == null) {
            if (repo.existsById(k)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Een eigen symbool heeft geen standaardtekening: " + k);
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Symbool niet gevonden: " + k);
        }
        return SymbolMapper.toDto(repo.save(fresh(std)));
    }

    /** Puts all standard symbols back to their standard drawings; the symbols of the user are left alone. */
    public List<SymbolDto> restoreAll() {
        for (SymbolDto std : StandardSymbols.all()) repo.save(fresh(std));
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
        return k != null && KEY.matcher(k).matches() && !RESERVED.contains(k);
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
