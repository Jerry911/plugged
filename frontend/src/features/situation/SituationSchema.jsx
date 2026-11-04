// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The situatieschema tab: tools and the selected item on the left, the plan in the middle, the elements that are not placed yet on the right.
import {useEffect, useRef, useState} from 'react'
import {allTypes, typeOf} from '../../symbols/symbolLibrary.js'
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
import {ComponentPalette, matchesSearch, UnplacedPanel} from './SituationPanels.jsx'

const TOOLS = ['select', 'wall', 'room', 'door', 'window', 'sym', 'text', 'erase']
const GRID_SIZES = [1, 2.5, 5, 10]
// a door or window closer than this to a wall (mm) snaps onto it
const WALL_SNAP_DISTANCE = 8
// the drawing area of the sheet (above the footer)
const DRAWING_BOTTOM = 185
const isOnSheet = (point) => point.x >= 0 && point.x <= 297 && point.y >= 0 && point.y <= DRAWING_BOTTOM
const ARROW_DIRECTIONS = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}
const isOpening = (item) => item.kind === 'door' || item.kind === 'window'
const movedWall = (wall, dx, dy) => ({...wall, x1: wall.x1 + dx, y1: wall.y1 + dy, x2: wall.x2 + dx, y2: wall.y2 + dy})

export default function SituationSchema({project, setProject, pageIndex, onFooter, educational}) {
    const {t} = useTranslation()
    const page = project.sit[pageIndex],
        {walls, items} = page,
        [tool, setTool] = useState('select'),
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
        [, forceRender] = useState(0),
        [panelOpen, setPanelOpen] = useState(true),
        [search, setSearch] = useState(''),
        [showHidden, setShowHidden] = useState(false),
        svgRef = useRef(),
        dimensionInput = useRef(),
        justBoxSelected = useRef(false),
        // last cursor position while drawing: survives the mouse leaving the sheet, gives the direction of a typed length
        aim = useRef(null)
    const scale = scaleOf(project.footer),
        showLengths = page.dims !== false
    const updatePage = (patch) => setProject({...project, sit: project.sit.map((existing, index) => (index === pageIndex ? {...existing, ...patch} : existing))})
    const nodes = placeableNodes(project),
        unplaced = unplacedNodes(project),
        hidden = hiddenNodes(project),
        marks = circuitMarks(project),
        paletteTypes = allTypes(project).filter((symbolType) => symbolType.place && matchesSearch(symbolType, search)),
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
    const deleteOne = (kind, id) =>
        updatePage(kind === 'wall' ? {walls: walls.filter((wall) => wall.id !== id)} : {items: items.filter((item) => item.id !== id)})
    const deleteSelection = () => {
        if (!selection.length) return
        updatePage({walls: walls.filter((wall) => !selectedIds.has(wall.id)), items: items.filter((item) => !selectedIds.has(item.id))})
        setSelection([])
    }
    const moveOne = (kind, id, dx, dy) =>
        kind === 'wall'
            ? updatePage({walls: walls.map((wall) => (wall.id !== id ? wall : movedWall(wall, dx, dy)))})
            : updatePage({
                  items: items.map((item) => {
                      if (item.id !== id) return item
                      const position = {x: item.x + dx, y: item.y + dy}
                      return isOpening(item) ? snapOpeningToWall(item, position) : {...item, ...position}
                  }),
              })
    const moveSelection = (dx, dy) =>
        selection.length === 1
            ? moveOne(selection[0].k, selection[0].id, dx, dy)
            : updatePage({
                  walls: walls.map((wall) => (selectedIds.has(wall.id) ? movedWall(wall, dx, dy) : wall)),
                  items: items.map((item) => (selectedIds.has(item.id) ? {...item, x: item.x + dx, y: item.y + dy} : item)),
              })
    const rotateSelection = (degrees) => updatePage({items: items.map((item) => (selectedIds.has(item.id) ? {...item, r: (item.r || 0) + degrees} : item))})
    const duplicateSelection = () => {
        const newWalls = walls.filter((wall) => selectedIds.has(wall.id)).map((wall) => ({...movedWall(wall, 5, 5), id: newId()})),
            newItems = items.filter((item) => selectedIds.has(item.id)).map((item) => ({...item, id: newId(), x: item.x + 5, y: item.y + 5}))
        updatePage({walls: [...walls, ...newWalls], items: [...items, ...newItems]})
        setSelection([...newWalls.map((wall) => ({k: 'wall', id: wall.id})), ...newItems.map((item) => ({k: 'item', id: item.id}))])
    }
    // the pointer handlers of a wall (part 'm' = the wall itself, 'a' / 'b' = its end points) or an item
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
            dragged.forEach((entry) => (originals[entry.id] = (entry.k === 'wall' ? walls : items).find((candidate) => candidate.id === entry.id)))
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
    const addRoom = (corner, oppositeCorner) => updatePage({walls: [...walls, ...rectangleWalls(corner, oppositeCorner).map((wall) => ({id: newId(), ...wall}))]})
    const onSheetClick = (event) => {
        if (justBoxSelected.current) {
            justBoxSelected.current = false
            return
        }
        const point = snappedPointOf(event)
        if (point.y > 180) return
        if (tool === 'select') setSelection([])
        else if (tool === 'wall') {
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
            updatePage({items: [...items, {id: newId(), kind: 'sym', type: componentType, x: point.x, y: point.y, r: 0, s: DEFAULT_ITEM_SIZE.sym}]})
        else if (tool === 'text') {
            const text = prompt(t('situation.textPrompt'))
            if (text) updatePage({items: [...items, {id: newId(), kind: 'text', x: point.x, y: point.y, txt: text, s: DEFAULT_ITEM_SIZE.text, r: 0}]})
        }
    }
    const dragTo = (currentDrag, point) => {
        const dx = point.x - currentDrag.start.x,
            dy = point.y - currentDrag.start.y,
            original = currentDrag.original
        if (currentDrag.part === 'a' || currentDrag.part === 'b') {
            const [xKey, yKey] = currentDrag.part === 'a' ? ['x1', 'y1'] : ['x2', 'y2']
            return updatePage({walls: walls.map((wall) => (wall.id !== currentDrag.id ? wall : {...wall, [xKey]: snap(point.x), [yKey]: snap(point.y)}))})
        }
        // the dragged element snaps to the grid; the others of the selection move along by the same distance
        const referenceX = currentDrag.kind === 'wall' ? original.x1 : original.x,
            referenceY = currentDrag.kind === 'wall' ? original.y1 : original.y,
            moveX = snap(referenceX + dx) - referenceX,
            moveY = snap(referenceY + dy) - referenceY
        updatePage({
            walls: walls.map((wall) => {
                const start = currentDrag.originals[wall.id]
                return start
                    ? {...wall, x1: round2(start.x1 + moveX), y1: round2(start.y1 + moveY), x2: round2(start.x2 + moveX), y2: round2(start.y2 + moveY)}
                    : wall
            }),
            items: items.map((item) => {
                const start = currentDrag.originals[item.id]
                if (!start) return item
                const position = {x: round2(start.x + moveX), y: round2(start.y + moveY)}
                return currentDrag.single && isOpening(item) ? snapOpeningToWall(item, position) : {...item, ...position}
            }),
        })
    }
    const onPointerMove = (event) => {
        if (selectionBox) return setSelectionBox({...selectionBox, to: sheetPointOf(event)})
        if (drag) return dragTo(drag, sheetPointOf(event))
        if (tool !== 'select' && tool !== 'erase') {
            const point = snappedPointOf(event)
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
        const hits = hitsInBox(box, walls, items)
        setSelection(selectionBox.add ? [...selection, ...hits.filter((hit) => !selectedIds.has(hit.id))] : hits)
    }
    const cancelDrawing = () => {
        setPending(null)
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
        selectedWall = singleSelection?.k === 'wall' && walls.find((wall) => wall.id === singleSelection.id)
    const updateSelectedItem = (patch) => updatePage({items: items.map((item) => (item.id === selectedItem.id ? {...item, ...patch} : item))})
    // the selected symbol: linked to an element of the eendraadschema (its properties are those of that element, also the waterproof one) or a loose one
    const selectedNode = selectedItem?.kind === 'sym' && selectedItem.node ? nodes.find((node) => node.id === selectedItem.node) : null,
        selectedSymbolType =
            selectedItem?.kind === 'sym'
                ? selectedNode
                    ? typeOf(project, selectedNode.type)
                    : allTypes(project).find((symbolType) => symbolType.k === selectedItem.type)
                : null
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
            if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || !selection.length) return
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
        [sizeMin, sizeMax] = selectedItem?.kind === 'text' ? [2, 12] : selectedItem?.kind === 'sym' ? [4, 20] : [6, 20]
    const selectionBounds = unionBox([
        ...walls.filter((wall) => selectedIds.has(wall.id)).map(wallBox),
        ...items.filter((item) => selectedIds.has(item.id)).map(itemBox),
    ])
    const editor = {
        svgRef,
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
                cancelDrawing()
                setTool('select')
            },
            style: {touchAction: 'none'},
        },
    }
    // the length input of a selected wall starts over when the wall changes
    const wallInputKey = (wall) => `${wall.id}:${wall.x1},${wall.y1},${wall.x2},${wall.y2}`
    return (
        <div className="row">
            <div className="side ui">
                <div className="tb" id="sit-tools">
                    {TOOLS.map((name) => (
                        <button key={name} id={'sit-tool-' + name} className={tool === name ? 'on' : ''} data-tour={'tool-' + name} onClick={() => chooseTool(name)}>
                            {t('situation.tools.' + name)}
                        </button>
                    ))}
                </div>
                <p id="sit-help">{t('situation.help')}</p>
                {selectedItem && (
                    <div className="warn" id="sit-props">
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <b id="sit-props-title">{t('situation.selected', {kind: t('situation.kinds.' + selectedItem.kind)})}</b>
                            <button
                                id="sit-close"
                                title={t('situation.closeSelection')}
                                aria-label={t('situation.closeSelection')}
                                style={{display: 'inline-flex', width: 'auto', padding: '2px 7px'}}
                                onClick={() => setSelection([])}
                            >
                                ✕
                            </button>
                        </div>
                        {selectedItem.kind === 'sym' && (
                            <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                {t('situation.text')}
                                <input
                                    id="sym-text"
                                    value={selectedItem.mark ?? (selectedItem.node ? marks.get(selectedItem.node) || '' : '')}
                                    placeholder={t('situation.markPlaceholder')}
                                    onChange={(event) => updateSelectedItem({mark: event.target.value})}
                                    style={{flex: 1, minWidth: 0}}
                                />
                                {selectedItem.node && selectedItem.mark !== undefined && (
                                    <button type="button" id="sym-text-reset" title={t('situation.resetMark')} onClick={() => updateSelectedItem({mark: undefined})}>
                                        ↺
                                    </button>
                                )}
                            </label>
                        )}
                        {selectedItem.kind === 'text' && (
                            <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                {t('situation.text')}
                                <input id="text-txt" value={selectedItem.txt} onChange={(event) => updateSelectedItem({txt: event.target.value})} style={{flex: 1, minWidth: 0}} />
                            </label>
                        )}
                        <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            {t('situation.size')}
                            <input
                                id="sit-size"
                                type="range"
                                min={sizeMin}
                                max={sizeMax}
                                step=".5"
                                value={selectedItem[sizeKey] || DEFAULT_ITEM_SIZE[selectedItem.kind]}
                                onChange={(event) => updateSelectedItem({[sizeKey]: +event.target.value})}
                                style={{flex: 1, minWidth: 0}}
                            />
                        </label>
                        {isOpening(selectedItem) && (
                            <label>
                                {t('situation.width')}{' '}
                                <input
                                    id="sit-width"
                                    key={`${selectedItem.id}:${selectedItem.w}`}
                                    defaultValue={formatLength(selectedItem.w || 10, scale)}
                                    onKeyDown={(event) => event.key === 'Enter' && setOpeningWidth(event.target.value)}
                                    onBlur={(event) => setOpeningWidth(event.target.value)}
                                    style={{width: 80}}
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
                        <div className="tb">
                            <button id="sit-rotate-ccw" onClick={() => updateSelectedItem({r: (selectedItem.r || 0) - 15})}>
                                ⟲15°
                            </button>
                            <button id="sit-rotate-cw" onClick={() => updateSelectedItem({r: (selectedItem.r || 0) + 15})}>
                                ⟳15°
                            </button>
                            <button id="sit-rotate-90" onClick={() => updateSelectedItem({r: (selectedItem.r || 0) + 90})}>
                                ⟳90°
                            </button>
                            {isOpening(selectedItem) && (
                                <>
                                    <button id="sit-flip" onClick={() => updateSelectedItem({f: !selectedItem.f})}>
                                        ⇅ {t('situation.mirror')}
                                    </button>
                                    <button id="sit-mirror" onClick={() => updateSelectedItem({m: !selectedItem.m})}>
                                        ⇄ {t('situation.mirror')}
                                    </button>
                                </>
                            )}
                            <button id="sit-duplicate" title={t('situation.duplicate')} onClick={duplicateSelection}>
                                ⧉
                            </button>
                        </div>
                    </div>
                )}
                {selectedWall && (
                    <div className="warn" id="sit-wall-props">
                        <b>{t('situation.wall')}</b>
                        <label>
                            {t('situation.length')}{' '}
                            <input
                                id="sit-wall-length"
                                key={wallInputKey(selectedWall)}
                                defaultValue={formatLength(Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1), scale)}
                                onKeyDown={(event) => event.key === 'Enter' && setWallLength(event.target.value)}
                                onBlur={(event) => setWallLength(event.target.value)}
                                style={{width: 80}}
                            />
                        </label>
                    </div>
                )}
                {selection.length > 1 && (
                    <div className="warn" id="sit-multi">
                        <b id="sit-multi-title">{t('situation.multipleSelected', {count: selection.length})}</b>
                        <div className="tb">
                            <button id="sit-multi-rotate-ccw" onClick={() => rotateSelection(-15)}>
                                ⟲15°
                            </button>
                            <button id="sit-multi-rotate-cw" onClick={() => rotateSelection(15)}>
                                ⟳15°
                            </button>
                            <button id="sit-multi-duplicate" title={t('situation.duplicate')} onClick={duplicateSelection}>
                                ⧉
                            </button>
                        </div>
                    </div>
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
                <div style={{position: 'relative', maxWidth: panelOpen ? 1100 : 1480}}>
                    <ZoomPane zoom={zoom} rightPan>
                        <div style={{width: `${zoom * 100}%`}}>
                            <SituationSheet project={project} page={page} {...pageNumbering(project, page)} editor={editor} onFooter={onFooter} />
                        </div>
                    </ZoomPane>
                    <ZoomControls zoom={zoom} setZoom={setZoom} idPrefix="sit-zoom">
                        <button
                            id="sit-toggle-lengths"
                            className={showLengths ? 'on' : ''}
                            aria-pressed={showLengths}
                            title={t('situation.toggleLengths')}
                            onClick={() => updatePage({dims: !showLengths})}
                        >
                            📏 {t('situation.lengths')}
                        </button>
                    </ZoomControls>
                    {pending && (tool === 'wall' || tool === 'room') && (
                        <div className="ui dimbox" id="sit-dimension" data-tour="dimbox">
                            <label>
                                {tool === 'room' ? t('situation.dimension.roomLabel') : t('situation.dimension.wallLabel')}{' '}
                                <input
                                    id="sit-dimension-input"
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
                            <button id="sit-dimension-ok" onClick={commitDimension}>
                                {t('common.ok')}
                            </button>
                            {suggestedScale && (
                                <button
                                    id="sit-dimension-scale"
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
                                    <span id="sit-dimension-error" className="dimerr">
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
                            <select id="sit-grid" value={gridSize} onChange={(event) => setGridSize(+event.target.value)}>
                                {GRID_SIZES.map((size) => (
                                    <option key={size} value={size}>
                                        {size} mm
                                    </option>
                                ))}
                            </select>
                        </label>{' '}
                        <label>
                            <input id="sit-free-drawing" type="checkbox" checked={freeDrawing} onChange={(event) => setFreeDrawing(event.target.checked)} />{' '}
                            {t('situation.freeDrawing')}
                        </label>
                    </div>
                </div>
            </div>
            <UnplacedPanel
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
                educational={educational}
            />
        </div>
    )
}
