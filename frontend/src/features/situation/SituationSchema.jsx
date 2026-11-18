// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The situatieschema tab: tools and the selected item on the left, the plan in the middle, the elements that are not placed yet on the right.
// The bedradingsschema tab (listKey 'wire') is the same editor with wires and rectangles on top: wires attach to the connection points of the
// symbols, have a line style and a colour; it has no list of elements to place and no starter templates, but can copy a plan of the situatieschema.
import {useEffect, useRef, useState} from 'react'
import {allTypes, symbolName, typeOf} from '../../symbols/symbolLibrary.js'
import ZoomPane from '../../components/ZoomPane.jsx'
import ZoomControls from '../../components/ZoomControls.jsx'
import {circuitMarks, hiddenNodes, placeableNodes, setNodeProperties, unplacedNodes} from '../../model/project.js'
import {newId} from '../../model/tree.js'
import {pageNumbering} from '../../model/boardLayout.js'
import {
    directionTo,
    formatLength,
    hitsInBox,
    itemBox,
    parseDimensions,
    parseLength,
    rectangleWalls,
    round2,
    scaleOf,
    suggestScale,
    toSheet,
    unionBox,
    wallBox,
} from '../../model/geometry.js'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {DEFAULT_ITEM_SIZE, SituationSheet} from './SituationSheet.jsx'
import TemplateDialog from './TemplateDialog.jsx'
import {hasDrawing, templatePages} from '../../model/planTemplates.js'
import {IconButton, PropertiesBox} from '../../components/PropertiesBox.jsx'
import {TOOLBAR_ICONS} from '../oneWire/icons.jsx'
import {useFillHeight} from '../../hooks/useFillHeight.js'
import {ComponentPalette, matchesSearch, UnplacedPanel} from './SituationPanels.jsx'
import {itemTypeOf, pagePins, showsLengths} from './SituationSheet.jsx'
import {
    boxBox,
    boxHitsBox,
    DEFAULT_PEN,
    detachFrom,
    endResolver,
    inWiring,
    lengthOf,
    moveWire,
    nearestOnSegment,
    PIN_SNAP_DISTANCE,
    pointsBox,
    WIRE_SNAP_DISTANCE,
    wireHitsBox,
    wirePoints,
} from '../../model/wiring.js'
import {CopyPlanDialog, copyPlan, LineStyleFields} from '../wiring/WiringPanels.jsx'

const TOOLS = ['select', 'wall', 'room', 'door', 'window', 'sym', 'text', 'erase']
const WIRING_TOOLS = ['select', 'wire', 'box', 'wall', 'room', 'door', 'window', 'sym', 'text', 'erase']
// the default size of a symbol placed on the bedradingsschema (mm) and the range of its size slider: furniture and cars are large
const WIRING_SYMBOL_SIZE = 10
const WIRING_SYMBOL_SIZES = [4, 150]
// the palette of the bedradingsschema starts with the symbols of control circuits and ends with the furniture
const PALETTE_ORDER = {Schakelschema: 0, Inrichting: 2}
const wiringOrder = (symbolTypes, wiring) =>
    wiring ? [...symbolTypes].sort((a, b) => (PALETTE_ORDER[a.cat] ?? 1) - (PALETTE_ORDER[b.cat] ?? 1)) : symbolTypes
const GRID_SIZES = [1, 2.5, 5, 10]
// a door or window closer than this to a wall (mm) snaps onto it
const WALL_SNAP_DISTANCE = 8
// the drawing area of the sheet (above the footer)
const DRAWING_BOTTOM = 185
const isOnSheet = (point) => point.x >= 0 && point.x <= 297 && point.y >= 0 && point.y <= DRAWING_BOTTOM
const ARROW_DIRECTIONS = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}
const isOpening = (item) => item.kind === 'door' || item.kind === 'window'
const movedWall = (wall, dx, dy) => ({...wall, x1: wall.x1 + dx, y1: wall.y1 + dy, x2: wall.x2 + dx, y2: wall.y2 + dy})
const samePoint = (a, b) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01
// where a wire is when it is moved as a whole: its first free point (an end on a symbol moves with the symbol)
const wireReference = (wire, resolve) => (wire.a?.item == null ? wire.a : wire.points?.[0] || (wire.b?.item == null ? wire.b : resolve(wire.a)))

/**
 * `onPageIndex(index)` shows another sheet (after a template added sheets); `onStatus(text)` a message for the user (a toast).
 * listKey: 'sit' (the situatieschema) or 'wire' (the bedradingsschema).
 */
export default function SituationSchema({project, setProject, pageIndex, onFooter, neutral, onPageIndex = () => {}, onStatus = () => {}, listKey = 'sit'}) {
    const {t} = useTranslation()
    const wiring = listKey === 'wire',
        P = wiring ? 'wire' : 'sit',
        page = project[listKey][pageIndex],
        {walls, items} = page,
        wires = page.wires || [],
        boxes = page.boxes || [],
        [tool, setTool] = useState('select'),
        // the line style of the next wire or rectangle
        [pen, setPen] = useState({...DEFAULT_PEN, ortho: true}),
        // the wire being drawn: {a: its start (an end, see model/wiring.js), points: its bends so far}
        [wireDraft, setWireDraft] = useState(null),
        [copyPlanOpen, setCopyPlanOpen] = useState(false),
        [componentType, setComponentType] = useState(null),
        // the first point of the wall or room being drawn
        [pending, setPending] = useState(null),
        [gridSize, setGridSize] = useState(5),
        [freeDrawing, setFreeDrawing] = useState(false),
        [zoom, setZoom] = useState(1),
        [cursor, setCursor] = useState(null),
        [selection, setSelection] = useState([]), // [{k: 'wall' | 'item', id}]
        [drag, setDrag] = useState(null),
        [selectionBox, setSelectionBox] = useState(null),
        [typedDimension, setTypedDimension] = useState(''),
        [templateOpen, setTemplateOpen] = useState(false),
        [, forceRender] = useState(0),
        [panelOpen, setPanelOpen] = useState(true),
        [search, setSearch] = useState(''),
        [showHidden, setShowHidden] = useState(false),
        svgRef = useRef(),
        dimensionInput = useRef(),
        justBoxSelected = useRef(false),
        // last cursor position while drawing: survives the mouse leaving the sheet, gives the direction of a typed length
        aim = useRef(null),
        leftPanel = useRef(null),
        rightPanel = useRef(null)
    const scale = scaleOf(project.footer),
        // the lengths show on a plan unless switched off; on the bedradingsschema (mostly schemas of boards) only when switched on
        showLengths = showsLengths(page)
    const updatePage = (patch) =>
        setProject({...project, [listKey]: project[listKey].map((existing, index) => (index === pageIndex ? {...existing, ...patch} : existing))})
    const nodes = placeableNodes(project),
        pinsOf = pagePins(project, nodes),
        resolve = endResolver(items, pinsOf),
        unplaced = unplacedNodes(project),
        hidden = hiddenNodes(project),
        marks = circuitMarks(project),
        paletteTypes = wiringOrder(
            allTypes(project).filter((symbolType) => (wiring ? inWiring(symbolType) : symbolType.place) && matchesSearch(symbolType, search)),
            wiring,
        ),
        looseSymbolsOnPage = page.items.filter((item) => item.kind === 'sym' && !item.node).length
    // the mouse position in sheet millimetres
    const sheetPointOf = (event) => {
        const svg = svgRef.current,
            point = svg.createSVGPoint()
        point.x = event.clientX
        point.y = event.clientY
        return point.matrixTransform(svg.getScreenCTM().inverse())
    }
    const snap = (value) => (freeDrawing ? Math.round(value * 10) / 10 : Math.round(value / gridSize) * gridSize)
    const snappedPointOf = (event) => {
        const point = sheetPointOf(event)
        return {x: snap(point.x), y: snap(point.y)}
    }
    // the nearest point on a wall, with the angle of that wall
    const nearestWallPoint = (point) => {
        let best = {distance: 1e9, angle: 0}
        walls.forEach((wall) => {
            const dx = wall.x2 - wall.x1,
                dy = wall.y2 - wall.y1,
                along = Math.max(0, Math.min(1, ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / (dx * dx + dy * dy || 1))),
                distance = Math.hypot(wall.x1 + along * dx - point.x, wall.y1 + along * dy - point.y)
            if (distance < best.distance)
                best = {distance, angle: (Math.atan2(dy, dx) * 180) / Math.PI, x: wall.x1 + along * dx, y: wall.y1 + along * dy}
        })
        return best
    }
    // a door or window at `position`: on the nearest wall (turned along it) when there is one close by
    const snapOpeningToWall = (item, position) => {
        const nearest = nearestWallPoint(position)
        return nearest.distance < WALL_SNAP_DISTANCE ? {...item, x: nearest.x, y: nearest.y, r: nearest.angle} : {...item, ...position}
    }
    const selectedIds = new Set(selection.map((entry) => entry.id))
    const listOf = (kind) => ({wall: walls, item: items, wire: wires, box: boxes})[kind]
    // the page without the elements with these ids: wires on deleted symbols keep their end where it was
    const withoutIds = (ids) => {
        const deletedItems = new Set(items.filter((item) => ids.has(item.id)).map((item) => item.id))
        return {
            walls: walls.filter((wall) => !ids.has(wall.id)),
            items: items.filter((item) => !ids.has(item.id)),
            ...(wiring
                ? {
                      wires: detachFrom(
                          wires.filter((wire) => !ids.has(wire.id)),
                          deletedItems,
                          resolve,
                      ),
                      boxes: boxes.filter((box) => !ids.has(box.id)),
                  }
                : {}),
        }
    }
    const deleteOne = (kind, id) => updatePage(withoutIds(new Set([id])))
    const deleteSelection = () => {
        if (!selection.length) return
        updatePage(withoutIds(selectedIds))
        setSelection([])
    }
    // the page with the elements of `moved` (ids) moved by (dx, dy); `originals` (by id) are where they started, default where they are
    const movedPage = (moved, dx, dy, originals = {}) => {
        const from = (element) => originals[element.id] || element
        return {
            walls: walls.map((wall) => (moved.has(wall.id) ? movedWall(from(wall), dx, dy) : wall)),
            items: items.map((item) => {
                if (!moved.has(item.id)) return item
                const start = from(item),
                    position = {x: round2(start.x + dx), y: round2(start.y + dy)}
                return moved.size === 1 && isOpening(item) ? snapOpeningToWall(item, position) : {...item, ...position}
            }),
            ...(wiring
                ? {
                      wires: wires.map((wire) => (moved.has(wire.id) ? moveWire(from(wire), dx, dy) : wire)),
                      boxes: boxes.map((box) => (moved.has(box.id) ? movedWall(from(box), dx, dy) : box)),
                  }
                : {}),
        }
    }
    const moveSelection = (dx, dy) => updatePage(movedPage(selectedIds, dx, dy))
    const rotateSelection = (degrees) => updatePage({items: items.map((item) => (selectedIds.has(item.id) ? {...item, r: (item.r || 0) + degrees} : item))})
    const duplicateSelection = () => {
        const itemIds = new Map(items.filter((item) => selectedIds.has(item.id)).map((item) => [item.id, newId()])),
            // a copied wire stays on the copies of its symbols; an end on a symbol that is not copied becomes a free end next to it
            copyEnd = (end) =>
                end?.item == null
                    ? {x: round2(end.x + 5), y: round2(end.y + 5)}
                    : itemIds.has(end.item)
                      ? {...end, item: itemIds.get(end.item)}
                      : copyEnd(resolve(end)),
            newWalls = walls.filter((wall) => selectedIds.has(wall.id)).map((wall) => ({...movedWall(wall, 5, 5), id: newId()})),
            newItems = items.filter((item) => itemIds.has(item.id)).map((item) => ({...item, id: itemIds.get(item.id), x: item.x + 5, y: item.y + 5})),
            newWires = wires
                .filter((wire) => selectedIds.has(wire.id))
                .map((wire) => ({
                    ...wire,
                    id: newId(),
                    a: copyEnd(wire.a),
                    b: copyEnd(wire.b),
                    points: (wire.points || []).map((point) => ({x: point.x + 5, y: point.y + 5})),
                })),
            newBoxes = boxes.filter((box) => selectedIds.has(box.id)).map((box) => ({...movedWall(box, 5, 5), id: newId()}))
        updatePage({
            walls: [...walls, ...newWalls],
            items: [...items, ...newItems],
            ...(wiring ? {wires: [...wires, ...newWires], boxes: [...boxes, ...newBoxes]} : {}),
        })
        setSelection([
            ...newWalls.map((wall) => ({k: 'wall', id: wall.id})),
            ...newItems.map((item) => ({k: 'item', id: item.id})),
            ...newWires.map((wire) => ({k: 'wire', id: wire.id})),
            ...newBoxes.map((box) => ({k: 'box', id: box.id})),
        ])
    }
    // the pointer handlers of a wall or rectangle (part 'm' = itself, 'a' / 'b' = its corners), a wire (part 'm', its ends 'a' / 'b', its
    // bends 'p0', 'p1', ...) or an item
    const interactionProps = (kind, id, part = 'm') => ({
        onPointerDown: (event) => {
            if (tool !== 'select') return
            event.stopPropagation()
            const inSelection = selection.some((entry) => entry.id === id)
            if (event.shiftKey && part === 'm')
                return setSelection(inSelection ? selection.filter((entry) => entry.id !== id) : [...selection, {k: kind, id}])
            const dragged = inSelection && part === 'm' ? selection : [{k: kind, id}],
                originals = {}
            if (dragged !== selection) setSelection(dragged)
            dragged.forEach((entry) => (originals[entry.id] = listOf(entry.k).find((candidate) => candidate.id === entry.id)))
            setDrag({kind, id, part, start: sheetPointOf(event), original: originals[id], originals, single: dragged.length === 1})
        },
        onClick: (event) => {
            if (tool === 'select') event.stopPropagation()
            else if (tool === 'erase') {
                event.stopPropagation()
                deleteOne(kind, id)
            }
        },
        style: {cursor: tool === 'select' ? 'move' : tool === 'erase' ? 'not-allowed' : undefined},
    })
    // Bedradingsschema: where a click (or a dragged wire end) lands: on a connection point of a symbol close by (the wire attaches to it), on a
    // wire close by (a branch), else on the grid. {end, point, onWire}
    const wireTargetAt = (raw, ignoreWire) => {
        let best = null
        items.forEach((item) => {
            if (item.kind !== 'sym') return
            pinsOf(item).forEach((pin, index) => {
                const distance = Math.hypot(pin.x - raw.x, pin.y - raw.y)
                if (distance <= PIN_SNAP_DISTANCE && (!best || distance < best.distance))
                    best = {distance, end: {item: item.id, pin: index, x: pin.x, y: pin.y}, point: pin}
            })
        })
        if (best) return best
        const grid = {x: snap(raw.x), y: snap(raw.y)}
        for (const wire of wires) {
            if (wire.id === ignoreWire) continue
            const points = wirePoints(wire, resolve)
            for (let index = 1; index < points.length; index++) {
                const hit = nearestOnSegment(raw, points[index - 1], points[index])
                if (hit.distance > WIRE_SNAP_DISTANCE) continue
                // on a straight leg the end keeps the grid along it
                const from = points[index - 1],
                    to = points[index],
                    point =
                        from.y === to.y && grid.x >= Math.min(from.x, to.x) && grid.x <= Math.max(from.x, to.x)
                            ? {x: grid.x, y: from.y}
                            : from.x === to.x && grid.y >= Math.min(from.y, to.y) && grid.y <= Math.max(from.y, to.y)
                              ? {x: from.x, y: grid.y}
                              : {x: round2(hit.point.x), y: round2(hit.point.y)}
                return {end: point, point, onWire: true}
            }
        }
        return {end: grid, point: grid}
    }
    const finishWire = (b, points) => {
        if (!wireDraft) return
        const a = wireDraft.a,
            start = resolve(a),
            end = resolve(b)
        setWireDraft(null)
        if (!start || !end || (samePoint(start, end) && !points.length)) return
        updatePage({wires: [...wires, {id: newId(), a, b, points, style: pen.style, color: pen.color, w: pen.w, ortho: pen.ortho}]})
    }
    // ends the wire being drawn at its last bend (right click, Enter); a wire without bends is dropped
    const endWireAtLastPoint = () => {
        if (!wireDraft) return false
        if (wireDraft.points.length) finishWire(wireDraft.points[wireDraft.points.length - 1], wireDraft.points.slice(0, -1))
        else setWireDraft(null)
        return true
    }
    const onWireClick = (raw) => {
        const target = wireTargetAt(raw)
        if (!wireDraft) return setWireDraft({a: target.end, points: []})
        const last = wireDraft.points.length ? wireDraft.points[wireDraft.points.length - 1] : resolve(wireDraft.a)
        if (target.end.item != null || target.onWire) {
            // a connection point or another wire ends the wire (not the point it started on)
            if (samePoint(target.point, resolve(wireDraft.a)) && !wireDraft.points.length) return
            return finishWire(target.end, wireDraft.points)
        }
        // a second click on the same spot (a double click) ends the wire there
        if (last && samePoint(last, target.point)) return endWireAtLastPoint()
        setWireDraft({...wireDraft, points: [...wireDraft.points, target.point]})
    }
    const addRoom = (corner, oppositeCorner) =>
        updatePage({walls: [...walls, ...rectangleWalls(corner, oppositeCorner).map((wall) => ({id: newId(), ...wall}))]})
    const onSheetClick = (event) => {
        if (justBoxSelected.current) {
            justBoxSelected.current = false
            return
        }
        const point = snappedPointOf(event)
        if (point.y > 180) return
        if (tool === 'select') setSelection([])
        else if (tool === 'wire') onWireClick(sheetPointOf(event))
        else if (tool === 'box') {
            if (!pending) setPending(point)
            else {
                if (pending.x !== point.x && pending.y !== point.y)
                    updatePage({
                        boxes: [...boxes, {id: newId(), x1: pending.x, y1: pending.y, x2: point.x, y2: point.y, style: pen.style, color: pen.color, w: pen.w}],
                    })
                setPending(null)
            }
        } else if (tool === 'wall') {
            if (!pending) setPending(point)
            else if (pending.x === point.x && pending.y === point.y) setPending(null)
            else {
                updatePage({walls: [...walls, {id: newId(), x1: pending.x, y1: pending.y, x2: point.x, y2: point.y}]})
                setPending(point)
            }
        } else if (tool === 'room') {
            if (!pending) setPending(point)
            else {
                if (pending.x !== point.x && pending.y !== point.y) addRoom(pending, point)
                setPending(null)
            }
        } else if (tool === 'door' || tool === 'window') {
            updatePage({items: [...items, snapOpeningToWall({id: newId(), kind: tool, r: 0, w: 10}, point)]})
        } else if (tool === 'sym' && componentType)
            updatePage({
                items: [
                    ...items,
                    {id: newId(), kind: 'sym', type: componentType, x: point.x, y: point.y, r: 0, s: wiring ? WIRING_SYMBOL_SIZE : DEFAULT_ITEM_SIZE.sym},
                ],
            })
        else if (tool === 'text') {
            const text = prompt(t('situation.textPrompt'))
            if (text) updatePage({items: [...items, {id: newId(), kind: 'text', x: point.x, y: point.y, txt: text, s: DEFAULT_ITEM_SIZE.text, r: 0}]})
        }
    }
    const dragTo = (currentDrag, point) => {
        const dx = point.x - currentDrag.start.x,
            dy = point.y - currentDrag.start.y,
            original = currentDrag.original,
            {kind, part, id} = currentDrag
        if (kind === 'wire' && part !== 'm') {
            // an end of a wire attaches to a connection point or another wire it is dropped on; a bend follows the grid
            if (part.startsWith('p')) {
                const index = +part.slice(1)
                return updatePage({
                    wires: wires.map((wire) =>
                        wire.id !== id
                            ? wire
                            : {...wire, points: wire.points.map((bend, bendIndex) => (bendIndex === index ? {x: snap(point.x), y: snap(point.y)} : bend))},
                    ),
                })
            }
            const end = wireTargetAt(point, id).end
            return updatePage({wires: wires.map((wire) => (wire.id !== id ? wire : {...wire, [part]: end}))})
        }
        if (part === 'a' || part === 'b') {
            const [xKey, yKey] = part === 'a' ? ['x1', 'y1'] : ['x2', 'y2'],
                key = kind === 'box' ? 'boxes' : 'walls'
            return updatePage({
                [key]: listOf(kind).map((element) => (element.id !== id ? element : {...element, [xKey]: snap(point.x), [yKey]: snap(point.y)})),
            })
        }
        // the dragged element snaps to the grid; the others of the selection move along by the same distance
        const reference = kind === 'wall' || kind === 'box' ? {x: original.x1, y: original.y1} : kind === 'wire' ? wireReference(original, resolve) : original,
            moveX = round2(snap(reference.x + dx) - reference.x),
            moveY = round2(snap(reference.y + dy) - reference.y)
        updatePage(movedPage(new Set(Object.keys(currentDrag.originals)), moveX, moveY, currentDrag.originals))
    }
    const onPointerMove = (event) => {
        if (selectionBox) return setSelectionBox({...selectionBox, to: sheetPointOf(event)})
        if (drag) return dragTo(drag, sheetPointOf(event))
        if (tool !== 'select' && tool !== 'erase') {
            const point = tool === 'wire' ? wireTargetAt(sheetPointOf(event)).point : snappedPointOf(event)
            aim.current = point
            if (!cursor || cursor.x !== point.x || cursor.y !== point.y) setCursor(point)
        }
    }
    const startSelectionBox = (event) => {
        justBoxSelected.current = false
        if (tool !== 'select' || event.button === 2) return
        const point = sheetPointOf(event)
        if (point.y <= DRAWING_BOTTOM) setSelectionBox({from: point, to: point, add: event.shiftKey})
    }
    const finishSelectionBox = () => {
        if (!selectionBox) return
        const box = {
            x0: Math.min(selectionBox.from.x, selectionBox.to.x),
            y0: Math.min(selectionBox.from.y, selectionBox.to.y),
            x1: Math.max(selectionBox.from.x, selectionBox.to.x),
            y1: Math.max(selectionBox.from.y, selectionBox.to.y),
        }
        setSelectionBox(null)
        if (box.x1 - box.x0 < 1.5 && box.y1 - box.y0 < 1.5) return
        justBoxSelected.current = true
        const hits = [
            ...hitsInBox(box, walls, items),
            ...wires.filter((wire) => wireHitsBox(wirePoints(wire, resolve), box)).map((wire) => ({k: 'wire', id: wire.id})),
            ...boxes.filter((candidate) => boxHitsBox(candidate, box)).map((candidate) => ({k: 'box', id: candidate.id})),
        ]
        setSelection(selectionBox.add ? [...selection, ...hits.filter((hit) => !selectedIds.has(hit.id))] : hits)
    }
    const cancelDrawing = () => {
        setPending(null)
        setWireDraft(null)
        setCursor(null)
        setSelectionBox(null)
        setTypedDimension('')
        aim.current = null
    }
    // Typed dimensions while drawing: a wall length, or "width x height" for a room (metres unless a unit is typed).
    // The direction comes from the last known cursor position (kept while the mouse is over the input).
    const typed = (() => {
        if (!pending) return null
        if (tool === 'wall') {
            const metres = parseLength(typedDimension),
                length = metres != null ? toSheet(metres, scale) : null
            if (!length) return null
            const direction = directionTo(pending, aim.current || {x: pending.x + 1, y: pending.y})
            return {end: {x: round2(pending.x + direction.x * length), y: round2(pending.y + direction.y * length)}}
        }
        if (tool === 'room') {
            const dimensions = parseDimensions(typedDimension),
                width = dimensions && toSheet(dimensions.w, scale),
                height = dimensions && toSheet(dimensions.h, scale)
            if (!width || !height) return null
            const towardsLeft = aim.current && aim.current.x < pending.x,
                towardsTop = aim.current && aim.current.y < pending.y
            return {end: {x: round2(pending.x + (towardsLeft ? -width : width)), y: round2(pending.y + (towardsTop ? -height : height))}}
        }
        return null
    })()
    const dimensionReadable = tool === 'room' ? !!parseDimensions(typedDimension) : parseLength(typedDimension) != null
    const neededMetres =
            tool === 'room'
                ? Math.max(parseDimensions(typedDimension)?.w ?? 0, parseDimensions(typedDimension)?.h ?? 0)
                : (parseLength(typedDimension) ?? 0),
        suggestedScale = dimensionReadable ? suggestScale(neededMetres, scale) : null
    const dimensionValid = dimensionReadable && !!typed && isOnSheet(typed.end)
    const dimensionError = !typedDimension
        ? ''
        : !dimensionReadable
          ? t('situation.dimension.invalid')
          : !typed || suggestedScale
            ? t('situation.dimension.doesNotFit', {scale})
            : !isOnSheet(typed.end)
              ? t('situation.dimension.offSheet')
              : ''
    const commitDimension = () => {
        if (!pending || !dimensionValid) return
        if (tool === 'wall') {
            updatePage({walls: [...walls, {id: newId(), x1: pending.x, y1: pending.y, x2: typed.end.x, y2: typed.end.y}]})
            setPending(typed.end)
            setTypedDimension('')
        } else if (tool === 'room') {
            addRoom(pending, typed.end)
            cancelDrawing()
        }
    }
    useEffect(() => {
        if (pending && dimensionInput.current) dimensionInput.current.focus()
    }, [pending])
    const singleSelection = selection.length === 1 ? selection[0] : null,
        selectedItem = singleSelection?.k === 'item' && items.find((item) => item.id === singleSelection.id),
        selectedWall = singleSelection?.k === 'wall' && walls.find((wall) => wall.id === singleSelection.id),
        selectedWire = singleSelection?.k === 'wire' && wires.find((wire) => wire.id === singleSelection.id),
        selectedBox = singleSelection?.k === 'box' && boxes.find((box) => box.id === singleSelection.id)
    const updateSelected = (key, patch) =>
        updatePage({[key]: page[key].map((element) => (element.id === singleSelection.id ? {...element, ...patch} : element))})
    const updateSelectedItem = (patch) => updatePage({items: items.map((item) => (item.id === selectedItem.id ? {...item, ...patch} : item))})
    // the selected symbol: linked to an element of the eendraadschema (its properties are those of that element, also the waterproof one) or a loose one
    const selectedNode = selectedItem?.kind === 'sym' && selectedItem.node ? nodes.find((node) => node.id === selectedItem.node) : null,
        selectedSymbolType = selectedItem ? itemTypeOf(project, selectedItem, nodes) : null
    const setWallLength = (text) => {
        const metres = parseLength(text),
            length = metres != null ? toSheet(metres, scale) : null
        if (!length) return
        const direction = directionTo({x: selectedWall.x1, y: selectedWall.y1}, {x: selectedWall.x2, y: selectedWall.y2}),
            x2 = round2(selectedWall.x1 + direction.x * length),
            y2 = round2(selectedWall.y1 + direction.y * length)
        if (x2 !== selectedWall.x2 || y2 !== selectedWall.y2) updatePage({walls: walls.map((wall) => (wall.id === selectedWall.id ? {...wall, x2, y2} : wall))})
    }
    const setOpeningWidth = (text) => {
        const metres = parseLength(text),
            width = metres != null ? toSheet(metres, scale) : null
        if (width && Math.abs(width - (selectedItem.w || 10)) > 0.005) updateSelectedItem({w: round2(width)})
    }
    useEffect(() => {
        const onKeyDown = (event) => {
            if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return
            if (event.key === 'Enter' && endWireAtLastPoint()) return event.preventDefault()
            if (!selection.length) return
            const direction = ARROW_DIRECTIONS[event.key]
            if (event.key === 'Delete' || event.key === 'Backspace') {
                deleteSelection()
                event.preventDefault()
            } else if (direction) {
                moveSelection(direction[0] * gridSize, direction[1] * gridSize)
                event.preventDefault()
            } else if (event.key === 'r') rotateSelection(15)
        }
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    })
    // Escape cancels the current tool/placement, same as a right click
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key !== 'Escape' || tool === 'select') return
            // the wire being drawn goes first, the wire tool stays on
            if (wireDraft) return setWireDraft(null)
            cancelDrawing()
            setTool('select')
        }
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    })
    // hide an element from the 'nergens geplaatst' list (it does not belong on the situatieschema) or bring it back
    const setHidden = (nodeId, hide) => {
        const others = (project.hidden || []).filter((id) => id !== nodeId)
        setProject({...project, hidden: hide ? [...others, nodeId] : others})
    }
    // all unplaced elements in rows along the bottom of the sheet
    const placeAllUnplaced = () =>
        updatePage({
            items: [
                ...items,
                ...unplaced.map((node, index) => ({
                    id: newId(),
                    kind: 'sym',
                    node: node.id,
                    x: 15 + (index % 26) * 10,
                    y: 170 - Math.floor(index / 26) * 12,
                    r: 0,
                    s: DEFAULT_ITEM_SIZE.sym,
                })),
            ],
        })
    // put one element on the drawing at the first free spot, starting in the middle of the sheet; it ends up selected so it can be dragged
    const placeNode = (nodeId) => {
        const symbols = items.filter((item) => item.kind === 'sym'),
            spiral = (step) => (step % 2 ? (step + 1) / 2 : -step / 2) // 0, 1, -1, 2, -2, ...
        let spot = {x: snap(148), y: snap(92)}
        for (let step = 0; step < 26 * 14; step++) {
            const x = Math.min(282, Math.max(15, snap(148 + spiral(step % 26) * 10))),
                y = Math.min(172, Math.max(15, snap(92 + spiral(Math.floor(step / 26)) * 12)))
            if (!symbols.some((item) => Math.abs(item.x - x) < 9 && Math.abs(item.y - y) < 9)) {
                spot = {x, y}
                break
            }
        }
        const id = newId()
        updatePage({items: [...items, {id, kind: 'sym', node: nodeId, x: spot.x, y: spot.y, r: 0, s: DEFAULT_ITEM_SIZE.sym}]})
        setSelection([{k: 'item', id}])
        setTool('select')
        cancelDrawing()
    }
    const chooseTool = (name) => {
        setTool(name)
        cancelDrawing()
    }
    // the size slider: the font size of a text, the size of a symbol, the width of a door or window
    const sizeKey = selectedItem && (selectedItem.kind === 'sym' || selectedItem.kind === 'text' ? 's' : 'w'),
        [sizeMin, sizeMax] = selectedItem?.kind === 'text' ? [2, 12] : selectedItem?.kind === 'sym' ? (wiring ? WIRING_SYMBOL_SIZES : [4, 20]) : [6, 20]
    const selectionBounds = unionBox([
        ...walls.filter((wall) => selectedIds.has(wall.id)).map(wallBox),
        ...items.filter((item) => selectedIds.has(item.id)).map(itemBox),
        ...wires
            .filter((wire) => selectedIds.has(wire.id))
            .map((wire) => pointsBox(wirePoints(wire, resolve)))
            .filter(Boolean),
        ...boxes.filter((box) => selectedIds.has(box.id)).map(boxBox),
    ])
    // the connection points shown while drawing wires or when a wire is selected; the one the mouse is on is highlighted
    const showPins = wiring && (tool === 'wire' || selection.some((entry) => entry.k === 'wire')),
        hoverEnd = showPins && cursor && tool === 'wire' ? wireTargetAt(cursor).end : null,
        pins = showPins
            ? items
                  .filter((item) => item.kind === 'sym')
                  .flatMap((item) =>
                      pinsOf(item).map((pin, index) => ({
                          item: item.id,
                          pin: index,
                          x: pin.x,
                          y: pin.y,
                          active: hoverEnd?.item === item.id && hoverEnd.pin === index,
                      })),
                  )
            : null
    const editor = {
        svgRef,
        prefix: P,
        pins,
        wirePreview:
            wireDraft && cursor
                ? {...pen, points: wirePoints({a: wireDraft.a, b: hoverEnd || cursor, points: wireDraft.points, ortho: pen.ortho}, resolve)}
                : wireDraft
                  ? {...pen, points: [resolve(wireDraft.a), ...wireDraft.points]}
                  : null,
        boxPreview: tool === 'box' && pending && cursor ? {from: pending, to: cursor} : null,
        selection,
        interactionProps,
        pending,
        typedEnd: dimensionValid ? typed.end : null,
        gridSize,
        tool,
        selectionBox,
        cursor: tool === 'select' || tool === 'erase' ? null : cursor,
        deleteButton:
            tool === 'select' && selectionBounds && !drag && !selectionBox
                ? {x: Math.min(289, selectionBounds.x1 + 3), y: Math.max(8, selectionBounds.y0 - 3), onClick: deleteSelection}
                : null,
        sheetEvents: {
            onClick: onSheetClick,
            onPointerDown: startSelectionBox,
            onPointerMove,
            onPointerUp: () => {
                setDrag(null)
                finishSelectionBox()
            },
            onPointerLeave: () => {
                setDrag(null)
                setCursor(null)
                setSelectionBox(null)
            },
            onContextMenu: (event) => {
                event.preventDefault()
                // a right click ends the wire being drawn; the next one leaves the wire tool
                if (endWireAtLastPoint()) return
                cancelDrawing()
                setTool('select')
            },
            style: {touchAction: 'none'},
        },
    }
    // the length input of a selected wall starts over when the wall changes
    // the panels reach to the bottom of the window (their lists scroll inside); the sheet takes all the width between them, so collapsing the
    // right panel makes it bigger
    useFillHeight(leftPanel)
    useFillHeight(rightPanel)
    const wallInputKey = (wall) => `${wall.id}:${wall.x1},${wall.y1},${wall.x2},${wall.y2}`
    // a starter template (TemplateDialog): its first floor on this sheet when it is empty, the other floors (or all of them, when this
    // sheet has a drawing) on new sheets right after it; a template that needs a larger scale sets the scale of the project
    const insertTemplate = (template, templateScale) => {
        const floors = templatePages(template, templateScale, t, newId),
            onThisPage = !hasDrawing([page])
        setProject((current) => {
            const sit = [...current.sit],
                index = current.sit.findIndex((candidate) => candidate.id === page.id),
                [first, ...rest] = floors,
                added = (onThisPage ? rest : floors).map((floor) => ({id: newId(), ...floor}))
            if (onThisPage) sit[index] = {...sit[index], ...first}
            sit.splice(index + 1, 0, ...added)
            return {...current, sit, ...(templateScale !== scale ? {footer: {...current.footer, schaal: '1:' + templateScale}} : {})}
        })
        setTemplateOpen(false)
        setSelection([])
        setTool('select')
        onPageIndex(onThisPage ? pageIndex : pageIndex + 1)
        onStatus(t('templates.inserted', {name: t('templates.names.' + template.id)}))
    }
    const pageEmpty = !walls.length && !items.length && !wires.length && !boxes.length,
        plansToCopy = project.sit.some((sitPage) => sitPage.walls.length || sitPage.items.length)
    // Plattegrond overnemen: the walls, doors, windows, texts (and symbols) of a situatieschema page are added to this page
    const insertPlan = (sitPageIndex, withSymbols) => {
        const copied = copyPlan(project, project.sit[sitPageIndex], withSymbols)
        updatePage({walls: [...walls, ...copied.walls], items: [...items, ...copied.items]})
        setCopyPlanOpen(false)
        setSelection([])
        setTool('select')
        onStatus(t('wiring.copyPlan.done', {name: project.sit[sitPageIndex].name}))
    }
    const wireLength = selectedWire ? lengthOf(wirePoints(selectedWire, resolve)) : 0
    return (
        <div className="row">
            <div className="side ui sticky-side fill" ref={leftPanel}>
                <div className="tb" id={P + '-tools'}>
                    {(wiring ? WIRING_TOOLS : TOOLS).map((name) => (
                        <button
                            key={name}
                            id={P + '-tool-' + name}
                            className={tool === name ? 'on' : ''}
                            data-tour={'tool-' + name}
                            onClick={() => chooseTool(name)}
                        >
                            {t('situation.tools.' + name)}
                        </button>
                    ))}
                    {wiring ? (
                        <button id="wire-copy-plan" title={t('wiring.copyPlan.buttonTitle')} disabled={!plansToCopy} onClick={() => setCopyPlanOpen(true)}>
                            ⌂ {t('wiring.copyPlan.button')}
                        </button>
                    ) : (
                        <button id={P + '-template'} title={t('templates.buttonTitle')} onClick={() => setTemplateOpen(true)}>
                            ⌂ {t('templates.button')}
                        </button>
                    )}
                </div>
                <p id={P + '-help'}>{wiring ? t(tool === 'wire' ? 'wiring.wireHelp' : 'wiring.help') : t('situation.help')}</p>
                {wiring && (tool === 'wire' || tool === 'box') && !selection.length && (
                    <PropertiesBox
                        id="wire-pen"
                        title={t('wiring.pen')}
                        titleId="wire-pen-heading"
                        closeId="wire-pen-close"
                        closeLabel={t('wiring.closePen')}
                        onClose={() => chooseTool('select')}
                    >
                        <LineStyleFields idPrefix="wire-pen" value={pen} withOrtho={tool === 'wire'} onChange={(patch) => setPen({...pen, ...patch})} />
                    </PropertiesBox>
                )}
                {selectedWire && (
                    <PropertiesBox
                        id="wire-wire-props"
                        title={t('situation.properties')}
                        titleId="wire-wire-heading"
                        subtitle={t('wiring.wireSelected', {length: formatLength(wireLength, scale)})}
                        subtitleId="wire-wire-title"
                        closeId="wire-wire-close"
                        closeLabel={t('situation.closeSelection')}
                        onClose={() => setSelection([])}
                    >
                        <LineStyleFields
                            idPrefix="wire-sel"
                            value={selectedWire}
                            withOrtho
                            onChange={(patch) => {
                                updateSelected('wires', patch)
                                const {ortho: _ortho, ...style} = patch
                                setPen({...pen, ...style})
                            }}
                        />
                        <div className="tb icons">
                            <IconButton id="wire-wire-duplicate" icon={TOOLBAR_ICONS.duplicate} title={t('situation.duplicate')} onClick={duplicateSelection} />
                            <IconButton
                                id="wire-wire-delete"
                                className="props-delete"
                                icon={TOOLBAR_ICONS.trash}
                                title={t('situation.deleteSelectionTitle')}
                                label={t('common.delete')}
                                onClick={deleteSelection}
                            />
                        </div>
                    </PropertiesBox>
                )}
                {selectedBox && (
                    <PropertiesBox
                        id="wire-box-props"
                        title={t('situation.properties')}
                        titleId="wire-box-heading"
                        subtitle={t('wiring.boxSelected')}
                        closeId="wire-box-close"
                        closeLabel={t('situation.closeSelection')}
                        onClose={() => setSelection([])}
                    >
                        <LineStyleFields idPrefix="wire-box" value={selectedBox} onChange={(patch) => updateSelected('boxes', patch)} />
                        <div className="tb icons">
                            <IconButton id="wire-box-duplicate" icon={TOOLBAR_ICONS.duplicate} title={t('situation.duplicate')} onClick={duplicateSelection} />
                            <IconButton
                                id="wire-box-delete"
                                className="props-delete"
                                icon={TOOLBAR_ICONS.trash}
                                title={t('situation.deleteSelectionTitle')}
                                label={t('common.delete')}
                                onClick={deleteSelection}
                            />
                        </div>
                    </PropertiesBox>
                )}
                {selectedItem && (
                    <PropertiesBox
                        id={P + '-props'}
                        title={t('situation.properties')}
                        titleId={P + '-props-heading'}
                        subtitle={
                            t('situation.selected', {kind: t('situation.kinds.' + selectedItem.kind)}) +
                            (selectedItem.kind === 'sym' && selectedSymbolType ? ' · ' + symbolName(selectedSymbolType) : '')
                        }
                        subtitleId={P + '-props-title'}
                        closeId={P + '-close'}
                        closeLabel={t('situation.closeSelection')}
                        onClose={() => setSelection([])}
                    >
                        {selectedItem.kind === 'sym' && (
                            <label>
                                {t('situation.text')}
                                <span className="props-field">
                                    <input
                                        id="sym-text"
                                        value={selectedItem.mark ?? (selectedItem.node ? marks.get(selectedItem.node) || '' : '')}
                                        placeholder={t('situation.markPlaceholder')}
                                        onChange={(event) => updateSelectedItem({mark: event.target.value})}
                                    />
                                    {selectedItem.node && selectedItem.mark !== undefined && (
                                        <button type="button" id="sym-text-reset" title={t('situation.resetMark')} aria-label={t('situation.resetMark')} onClick={() => updateSelectedItem({mark: undefined})}>
                                            ↺
                                        </button>
                                    )}
                                </span>
                            </label>
                        )}
                        {selectedItem.kind === 'text' && (
                            <label>
                                {t('situation.text')}
                                <input id="text-txt" className="props-wide" value={selectedItem.txt} onChange={(event) => updateSelectedItem({txt: event.target.value})} />
                            </label>
                        )}
                        <label>
                            {t('situation.size')}
                            <input
                                id={P + '-size'}
                                className="props-wide"
                                type="range"
                                min={sizeMin}
                                max={sizeMax}
                                step=".5"
                                value={selectedItem[sizeKey] || DEFAULT_ITEM_SIZE[selectedItem.kind]}
                                onChange={(event) => updateSelectedItem({[sizeKey]: +event.target.value})}
                            />
                        </label>
                        {isOpening(selectedItem) && (
                            <label>
                                {t('situation.width')}
                                <input
                                    id={P + '-width'}
                                    className="props-wide"
                                    key={`${selectedItem.id}:${selectedItem.w}`}
                                    defaultValue={formatLength(selectedItem.w || 10, scale)}
                                    onKeyDown={(event) => event.key === 'Enter' && setOpeningWidth(event.target.value)}
                                    onBlur={(event) => setOpeningWidth(event.target.value)}
                                />
                            </label>
                        )}
                        {selectedItem.kind === 'sym' && selectedSymbolType?.sock && (
                            <label>
                                <input
                                    id="sym-waterproof"
                                    type="checkbox"
                                    checked={!!(selectedNode ? selectedNode.p?.h : selectedItem.h)}
                                    onChange={(event) =>
                                        selectedNode
                                            ? setProject(setNodeProperties(project, selectedNode.id, {h: event.target.checked}))
                                            : updateSelectedItem({h: event.target.checked})
                                    }
                                />{' '}
                                {t('situation.waterproof')}
                            </label>
                        )}
                        <div className="tb icons">
                            <IconButton
                                id={P + '-rotate-ccw'}
                                icon={TOOLBAR_ICONS.counterClockwise}
                                text="15°"
                                title={t('situation.rotateCounterClockwiseTitle', {degrees: 15})}
                                onClick={() => updateSelectedItem({r: (selectedItem.r || 0) - 15})}
                            />
                            <IconButton
                                id={P + '-rotate-cw'}
                                icon={TOOLBAR_ICONS.clockwise}
                                text="15°"
                                title={t('situation.rotateClockwiseTitle', {degrees: 15})}
                                onClick={() => updateSelectedItem({r: (selectedItem.r || 0) + 15})}
                            />
                            <IconButton
                                id={P + '-rotate-90'}
                                icon={TOOLBAR_ICONS.quarterTurn}
                                text="90°"
                                title={t('situation.rotateClockwiseTitle', {degrees: 90})}
                                onClick={() => updateSelectedItem({r: (selectedItem.r || 0) + 90})}
                            />
                            {isOpening(selectedItem) && (
                                <>
                                    <IconButton
                                        id={P + '-flip'}
                                        icon={TOOLBAR_ICONS.flip}
                                        title={t('situation.flipTitle')}
                                        onClick={() => updateSelectedItem({f: !selectedItem.f})}
                                    />
                                    <IconButton
                                        id={P + '-mirror'}
                                        icon={TOOLBAR_ICONS.mirror}
                                        title={t('situation.mirrorTitle')}
                                        onClick={() => updateSelectedItem({m: !selectedItem.m})}
                                    />
                                </>
                            )}
                            <IconButton id={P + '-duplicate'} icon={TOOLBAR_ICONS.duplicate} title={t('situation.duplicate')} onClick={duplicateSelection} />
                            <IconButton
                                id={P + '-delete'}
                                className="props-delete"
                                icon={TOOLBAR_ICONS.trash}
                                title={t('situation.deleteSelectionTitle')}
                                label={t('common.delete')}
                                onClick={deleteSelection}
                            />
                            {!!selectedItem.r && <small id={P + '-rotation'}> {((selectedItem.r % 360) + 360) % 360}°</small>}
                        </div>
                    </PropertiesBox>
                )}
                {selectedWall && (
                    <PropertiesBox
                        id={P + '-wall-props'}
                        title={t('situation.properties')}
                        titleId={P + '-wall-heading'}
                        subtitle={t('situation.wall')}
                        closeId={P + '-wall-close'}
                        closeLabel={t('situation.closeSelection')}
                        onClose={() => setSelection([])}
                    >
                        <label>
                            {t('situation.length')}
                            <input
                                id={P + '-wall-length'}
                                className="props-wide"
                                key={wallInputKey(selectedWall)}
                                defaultValue={formatLength(Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1), scale)}
                                onKeyDown={(event) => event.key === 'Enter' && setWallLength(event.target.value)}
                                onBlur={(event) => setWallLength(event.target.value)}
                            />
                        </label>
                        <div className="tb icons">
                            <IconButton
                                id={P + '-wall-duplicate'}
                                icon={TOOLBAR_ICONS.duplicate}
                                title={t('situation.duplicate')}
                                onClick={duplicateSelection}
                            />
                            <IconButton
                                id={P + '-wall-delete'}
                                className="props-delete"
                                icon={TOOLBAR_ICONS.trash}
                                title={t('situation.deleteSelectionTitle')}
                                label={t('common.delete')}
                                onClick={deleteSelection}
                            />
                        </div>
                    </PropertiesBox>
                )}
                {selection.length > 1 && (
                    <PropertiesBox
                        id={P + '-multi'}
                        title={t('situation.properties')}
                        titleId={P + '-multi-heading'}
                        subtitle={t('situation.multipleSelected', {count: selection.length})}
                        subtitleId={P + '-multi-title'}
                        closeId={P + '-multi-close'}
                        closeLabel={t('situation.closeSelection')}
                        onClose={() => setSelection([])}
                    >
                        <div className="tb icons">
                            <IconButton
                                id={P + '-multi-rotate-ccw'}
                                icon={TOOLBAR_ICONS.counterClockwise}
                                text="15°"
                                title={t('situation.rotateCounterClockwiseTitle', {degrees: 15})}
                                onClick={() => rotateSelection(-15)}
                            />
                            <IconButton
                                id={P + '-multi-rotate-cw'}
                                icon={TOOLBAR_ICONS.clockwise}
                                text="15°"
                                title={t('situation.rotateClockwiseTitle', {degrees: 15})}
                                onClick={() => rotateSelection(15)}
                            />
                            <IconButton
                                id={P + '-multi-duplicate'}
                                icon={TOOLBAR_ICONS.duplicate}
                                title={t('situation.duplicate')}
                                onClick={duplicateSelection}
                            />
                            <IconButton
                                id={P + '-multi-delete'}
                                className="props-delete"
                                icon={TOOLBAR_ICONS.trash}
                                title={t('situation.deleteSelectionTitle')}
                                label={t('common.delete')}
                                onClick={deleteSelection}
                            />
                        </div>
                    </PropertiesBox>
                )}
                <ComponentPalette
                    project={project}
                    symbolTypes={paletteTypes}
                    placedCount={looseSymbolsOnPage}
                    search={search}
                    onSearch={setSearch}
                    activeType={componentType}
                    onChoose={(key) => {
                        setComponentType(key)
                        setTool('sym')
                    }}
                />
            </div>
            <div className="main">
                {pageEmpty && wiring && plansToCopy && (
                    <div id="wire-empty" className="sitempty">
                        <span>{t('wiring.emptyHint')}</span>
                        <button id="wire-empty-copy" className="accent" onClick={() => setCopyPlanOpen(true)}>
                            ⌂ {t('wiring.copyPlan.button')}
                        </button>
                    </div>
                )}
                {copyPlanOpen && <CopyPlanDialog project={project} onCopy={insertPlan} onClose={() => setCopyPlanOpen(false)} />}
                {pageEmpty && !wiring && (
                    <div id={P + '-empty'} className="sitempty">
                        <span>{t('templates.emptyHint')}</span>
                        <button id={P + '-empty-template'} className="accent" onClick={() => setTemplateOpen(true)}>
                            ⌂ {t('templates.emptyButton')}
                        </button>
                    </div>
                )}
                {templateOpen && <TemplateDialog project={project} pageIndex={pageIndex} onChoose={insertTemplate} onClose={() => setTemplateOpen(false)} />}
                <div style={{position: 'relative'}}>
                    <ZoomPane zoom={zoom} rightPan>
                        <div style={{width: `${zoom * 100}%`}}>
                            <SituationSheet project={project} page={page} {...pageNumbering(project, page)} editor={editor} onFooter={onFooter} />
                        </div>
                    </ZoomPane>
                    <ZoomControls zoom={zoom} setZoom={setZoom} idPrefix={P + '-zoom'}>
                        <button
                            id={P + '-toggle-lengths'}
                            className={showLengths ? 'on' : ''}
                            aria-pressed={showLengths}
                            title={t('situation.toggleLengths')}
                            onClick={() => updatePage({dims: !showLengths})}
                        >
                            📏 {t('situation.lengths')}
                        </button>
                    </ZoomControls>
                    {pending && (tool === 'wall' || tool === 'room') && (
                        <div className="ui dimbox" id={P + '-dimension'} data-tour="dimbox">
                            <label>
                                {tool === 'room' ? t('situation.dimension.roomLabel') : t('situation.dimension.wallLabel')}{' '}
                                <input
                                    id={P + '-dimension-input'}
                                    ref={dimensionInput}
                                    data-tour="dim-input"
                                    className={typedDimension && !dimensionValid ? 'bad' : ''}
                                    title={dimensionError}
                                    value={typedDimension}
                                    placeholder={tool === 'room' ? t('situation.dimension.roomPlaceholder') : t('situation.dimension.wallPlaceholder')}
                                    aria-description={t('situation.dimension.arrowsDescription')}
                                    onChange={(event) => setTypedDimension(event.target.value)}
                                    onKeyDown={(event) => {
                                        const direction = ARROW_DIRECTIONS[event.key]
                                        if (event.key === 'Enter') commitDimension()
                                        else if (event.key === 'Escape') cancelDrawing()
                                        else if (direction) {
                                            // arrow keys choose the direction of the typed length
                                            event.preventDefault()
                                            aim.current = {x: pending.x + direction[0], y: pending.y + direction[1]}
                                            forceRender((count) => count + 1)
                                        }
                                    }}
                                />
                            </label>{' '}
                            <button id={P + '-dimension-ok'} onClick={commitDimension}>
                                {t('common.ok')}
                            </button>
                            {suggestedScale && (
                                <button
                                    id={P + '-dimension-scale'}
                                    data-tour="dim-scale"
                                    onClick={() => {
                                        setProject({...project, footer: {...project.footer, schaal: '1:' + suggestedScale}})
                                        dimensionInput.current?.focus() // the button disappears: Enter has to keep working in the length box
                                    }}
                                >
                                    {t('situation.dimension.scaleButton', {scale: suggestedScale})}
                                </button>
                            )}
                            <div>
                                {dimensionError ? (
                                    <span id={P + '-dimension-error'} className="dimerr">
                                        {' '}
                                        {dimensionError}
                                    </span>
                                ) : (
                                    <span className="dimhint"> ←↑↓→ {t('situation.dimension.direction')}</span>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="ui gridsel" style={zoom === 1 ? undefined : {bottom: 12}}>
                        <label>
                            {t('situation.grid')}{' '}
                            <select id={P + '-grid'} value={gridSize} onChange={(event) => setGridSize(+event.target.value)}>
                                {GRID_SIZES.map((size) => (
                                    <option key={size} value={size}>
                                        {size} mm
                                    </option>
                                ))}
                            </select>
                        </label>{' '}
                        <label>
                            <input id={P + '-free-drawing'} type="checkbox" checked={freeDrawing} onChange={(event) => setFreeDrawing(event.target.checked)} />{' '}
                            {t('situation.freeDrawing')}
                        </label>
                    </div>
                </div>
            </div>
            {!wiring && (
                <UnplacedPanel
                    ref={rightPanel}
                    project={project}
                    unplaced={unplaced}
                    hidden={hidden}
                    marks={marks}
                    open={panelOpen}
                    onToggleOpen={() => setPanelOpen((open) => !open)}
                    showHidden={showHidden}
                    onToggleShowHidden={() => setShowHidden((shown) => !shown)}
                    onPlace={placeNode}
                    onPlaceAll={placeAllUnplaced}
                    onSetHidden={setHidden}
                    neutral={neutral}
                />
            )}
        </div>
    )
}
