// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The eendraadschema tab: the palette, the Eigenschappen panel and the Opbouw list on the left, the drawn sheets of the page on the right.
import {useEffect, useRef, useState} from 'react'
import {allTypes, EMPTY_TYPE, symbolName, typeOf} from '../../symbols/symbolLibrary.js'
import {circuitInfo, defaultProperties, nextCircuitLetter, sheetPlan} from '../../model/boardLayout.js'
import {
    ancestorIdsOf,
    findNode,
    flatten,
    indentNode,
    moveNode,
    newId,
    outdentNode,
    removeNode,
    replaceNode,
    rotateNode,
    updateNode,
    withNewIds,
} from '../../model/tree.js'
import {addSibling, circuitOf, emptyChoices, insertAt, insertTypes, parentOf, siblingTypes} from '../../model/insertion.js'
import ZoomPane from '../../components/ZoomPane.jsx'
import ZoomControls from '../../components/ZoomControls.jsx'
import {useTranslation} from '../../i18n/I18nProvider.jsx'
import {BoardSheet} from './BoardSheet.jsx'
import {DISTRIBUTION_TYPES} from './elementFields.js'
import SymbolPalette from './SymbolPalette.jsx'
import PropertiesPanel from './PropertiesPanel.jsx'
import StructureTree from './StructureTree.jsx'

// id of the element that is drawn (in blue) while a symbol from the palette is dragged over the drawing
const GHOST_ID = '~ghost~'
// parts of the main line: dropped on the drawing they go in front of the board (the circuits stay visible)
const MAIN_LINE_TYPES = ['aansluiting', 'teller', 'hoofdschakelaar']

// Centers an element in the part of the screen that is really visible: scrolls its own scroll containers (zoomed drawing),
// then the page, leaving out the sticky check popup (.verify) that covers the top of the screen.
function centerInView(element) {
    if (!element) return
    for (let container = element.parentElement; container && container !== document.body; container = container.parentElement) {
        const style = getComputedStyle(container)
        const scrolls = /(auto|scroll)/.test(style.overflowY + style.overflowX)
        if (scrolls && (container.scrollHeight > container.clientHeight || container.scrollWidth > container.clientWidth)) {
            const elementBox = element.getBoundingClientRect(),
                containerBox = container.getBoundingClientRect()
            container.scrollTo({
                left: container.scrollLeft + (elementBox.left + elementBox.width / 2) - (containerBox.left + containerBox.width / 2),
                top: container.scrollTop + (elementBox.top + elementBox.height / 2) - (containerBox.top + containerBox.height / 2),
                behavior: 'instant',
            })
        }
    }
    const popup = document.querySelector('.verify'),
        visibleTop = popup ? Math.max(0, popup.getBoundingClientRect().bottom) : 0,
        elementBox = element.getBoundingClientRect(),
        visibleMiddle = visibleTop + (innerHeight - visibleTop) / 2
    scrollBy({top: elementBox.top + elementBox.height / 2 - visibleMiddle, behavior: 'smooth'})
}

/**
 * pageIndex = the eendraadschema page that is shown. focus = {id} of an element to select and scroll to (e.g. from a check message),
 * onFocused() is called once it is handled. onFooter(field) opens the Kaderinfo.
 */
export default function OneWireDiagram({project, setProject, pageIndex, focus, onFocused, onFooter}) {
    const {t} = useTranslation()
    const page = project.een[pageIndex],
        tree = page.tree,
        symbolTypes = allTypes(project),
        [selectedId, setSelectedId] = useState(null),
        [free, setFree] = useState(false),
        [search, setSearch] = useState(''),
        [zoom, setZoom] = useState(1),
        [folded, setFolded] = useState(() => new Set()),
        // drag & drop from the palette: the symbol type that is being dragged and where it would land ({id, mode, zone, sheetNumber})
        [draggedType, setDraggedType] = useState(null),
        [dropTarget, setDropTarget] = useState(null),
        drawing = useRef(null)
    // a focus (e.g. the message of a check): select the element and scroll the drawing to it (when it is drawn on this sheet), then report it as handled
    useEffect(() => {
        if (!focus) return
        setSelectedId(focus.id)
        const findDrawn = () => drawing.current?.querySelector(`[data-nid="${String(focus.id).replace(/["\\]/g, '\\$&')}"]`)
        if (findDrawn()) {
            // wait until the selection has changed the layout, otherwise the scroll target moves while scrolling
            // (no cleanup: onFocused() resets the focus at once, which would cancel this timer)
            setTimeout(() => centerInView(findDrawn()), 50)
        }
        onFocused?.()
    }, [focus])
    const unfold = (ids) =>
        setFolded((current) => (ids.some((id) => current.has(id)) ? new Set([...current].filter((id) => !ids.includes(id))) : current))
    const toggleFold = (id) =>
        setFolded((current) => {
            const next = new Set(current)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    // a selected element (e.g. clicked in the drawing) is never hidden inside a folded level
    useEffect(() => {
        if (selectedId) unfold(ancestorIdsOf(tree, selectedId) || [])
    }, [selectedId])
    const setTree = (newTree) => setProject({...project, een: project.een.map((existing, index) => (index === pageIndex ? {...existing, tree: newTree} : existing))}),
        selected = selectedId && findNode(tree, selectedId)
    const removeSelected = () => {
        if (!selected) return
        setTree(removeNode(tree, selected.id))
        setSelectedId(null)
    }
    useEffect(() => {
        const onKeyDown = (event) => {
            if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || !selected) return
            if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault()
                removeSelected()
            }
        }
        addEventListener('keydown', onKeyDown)
        return () => removeEventListener('keydown', onKeyDown)
    })
    const allNodes = flatten(tree)
    const typeOfKey = (key) => typeOf(project, key)
    // where a symbol from the palette goes: under the selected element when it fits there, else under the last element it may hang under
    const parentFor = (symbolType) => {
        if (selected && (free || symbolType.parents.includes(selected.type)) && !(symbolType.k === 'kring' && selected.type === 'kring')) return selected
        for (const parentType of symbolType.parents) {
            const candidates = allNodes.filter((node) => node.type === parentType)
            if (candidates.length) return candidates.at(-1)
        }
        return null
    }
    // a new element of the given symbol type (a circuit gets the next free letter, a distribution part its default properties; the text of any
    // other element starts empty)
    const newNodeOf = (symbolType) => {
        const node = {id: newId(), type: symbolType.k, label: symbolType.k === 'kring' ? nextCircuitLetter(tree) : '', info: '', children: []},
            properties = defaultProperties(symbolType.k)
        if (properties) {
            node.p = {...properties}
            if (symbolType.k === 'kring') node.info = circuitInfo(node.p)
        }
        return node
    }
    // a click in the palette
    const addFromPalette = (symbolType) => {
        const node = newNodeOf(symbolType)
        if (!symbolType.parents.length) return setTree([...tree, node])
        const parent = parentFor(symbolType)
        if (!parent) {
            if (free && !selected) return setTree([...tree, node])
            return alert(
                selected
                    ? t('oneWire.onlyUnder', {name: symbolName(symbolType), parents: symbolType.parents.map((key) => symbolName(typeOfKey(key))).join(', ')})
                    : t('oneWire.selectParentFirst'),
            )
        }
        setTree(replaceNode(tree, parent.id, (target) => [{...target, children: [...target.children, node]}]))
        unfold([parent.id])
        if (DISTRIBUTION_TYPES.includes(symbolType.k)) setSelectedId(node.id)
    }
    // dropped from the palette: a differentieel makes a new circuit (a kring) that is protected by a differentieel, just like an automaat makes a circuit
    const newDroppedNode = (symbolType) => {
        if (symbolType.k !== 'diff') return newNodeOf(symbolType)
        const circuit = newNodeOf(typeOfKey('kring')),
            properties = {...circuit.p, bescherming: 'differentieel', amp: 25, curve: '', delta: 30, diffType: 'A', kortsl: ''}
        return {...circuit, p: properties, info: circuitInfo(properties)}
    }
    // insert a symbol type relative to the element `id` and select it
    const insertSymbol = (id, mode, symbolType) => {
        const node = newDroppedNode(symbolType)
        setTree(insertAt(tree, id, mode, node))
        unfold([id])
        setSelectedId(node.id)
    }
    // the buttons in Eigenschappen: insert an empty element (type 'leeg') before / after the selected one; its Type dropdown lists what fits there.
    // mode 'branch' = the next branch: a new element next to the selected one under the same parent (B1 -> B2), drawn above it
    const insertEmpty = (mode) => {
        if (!selected) return
        const node = {id: newId(), type: EMPTY_TYPE.k, label: '', info: '', children: []}
        setTree(mode === 'branch' ? addSibling(tree, selected.id, node) : insertAt(tree, selected.id, mode, node))
        unfold([selected.id])
        setSelectedId(node.id)
    }
    const updateSelected = (change) => setTree(updateNode(tree, selected.id, change))
    const setProperty = (key, value) =>
        updateSelected((node) => {
            const properties = {...node.p, [key]: value}
            return {...node, p: properties, ...(node.type === 'kring' ? {info: circuitInfo(properties)} : {})}
        })
    // change the type of the selected element; the name follows when it was still the default one
    const changeType = (key) =>
        updateSelected((node) => {
            // an empty element becomes a real one: it gets the default properties of a new element of that type (and, like a new element, an empty text)
            if (node.type === EMPTY_TYPE.k) {
                const properties = defaultProperties(key)
                return {
                    ...node,
                    type: key,
                    label: key === 'kring' ? nextCircuitLetter(tree) : '',
                    ...(properties ? {p: {...properties}, info: key === 'kring' ? circuitInfo(properties) : node.info} : {}),
                }
            }
            const oldName = symbolName(typeOfKey(node.type)),
                newName = symbolName(typeOfKey(key)),
                keepsDefaultName = node.label === oldName || (!node.label && key === 'kring')
            return {...node, type: key, label: keepsDefaultName ? newName : node.label}
        })
    // the types the selected element can become: same kind (not a distribution part) that fits under its parent
    const isEmpty = selected?.type === EMPTY_TYPE.k
    const swapTypes = (() => {
        if (!selected) return []
        // an empty element: everything that may hang under its parent (the "kan geplaatst worden na" list) and accepts what hangs under it
        if (isEmpty) return emptyChoices(typeOfKey, tree, symbolTypes, selected, free)
        if (DISTRIBUTION_TYPES.includes(selected.type)) return []
        const parent = parentOf(tree, selected.id)
        return symbolTypes.filter(
            (symbolType) =>
                symbolType.place &&
                !DISTRIBUTION_TYPES.includes(symbolType.k) &&
                (symbolType.k === selected.type || free || !parent || symbolType.parents.includes(parent.type)),
        )
    })()
    // can anything be inserted before / after the selected element? (the buttons in Eigenschappen)
    const canInsertBefore = !!selected && insertTypes(typeOfKey, tree, symbolTypes, selected, 'before', free).length > 0,
        canInsertAfter = !!selected && insertTypes(typeOfKey, tree, symbolTypes, selected, 'after', free).length > 0,
        canAddBranch = !!selected && siblingTypes(tree, symbolTypes, selected, free).length > 0
    const sheets = sheetPlan(project, true).filter((sheet) => sheet.kind === 'een' && sheet.page === page)

    // Drag & drop: any symbol can be dropped anywhere. It does not check whether the symbol "fits" there, it just does it and the user corrects
    // a mistake. Where it lands depends on what the pointer is over:
    // - a symbol inside a circuit: before it (left half) or after it (right half)
    // - the free area or the stem of a circuit: a circuit (kring, differentieel) comes next to it (left / right half), a smeltveiligheid in front
    //   of it, a part of the main line (teller, verdeelbord, ...) goes where it goes on the bus, anything else becomes its last branch
    // - the bus, the head (kWh meter, earth) or the space below the bus: a circuit becomes the last circuit, a part of the main line comes in
    //   front of the board, anything else hangs under the board
    // - anywhere else on the sheet (above the bus): the nearest circuit counts
    const dropTargetAt = (event) => {
        if (!draggedType) return null
        const key = draggedType.k,
            makesCircuit = key === 'kring' || key === 'diff',
            sheetElement = event.currentTarget,
            busId = sheets[0]?.board.bus?.id,
            onBus = () =>
                busId
                    ? {id: busId, mode: MAIN_LINE_TYPES.includes(key) ? 'before' : 'after', zone: 'bus'}
                    : tree.length
                      ? {id: tree.at(-1).id, mode: 'after', zone: 'bus'}
                      : {id: null, mode: 'root', zone: 'bus'},
            onCircuit = (circuit, hitArea) => {
                if (!makesCircuit) {
                    if (key === 'zekering') return {id: circuit.id, mode: 'before', zone: 'circuit'}
                    return MAIN_LINE_TYPES.includes(key) || key === 'bord' ? onBus() : {id: circuit.id, mode: 'after', zone: 'circuit'}
                }
                const box = (hitArea || sheetElement?.querySelector?.(`[data-hit="${circuit.id}"]`))?.getBoundingClientRect()
                return {id: circuit.id, mode: box && event.clientX < box.left + box.width / 2 ? 'left' : 'right', zone: 'circuit'}
            }
        const element = event.target?.closest?.('[data-nid],[data-hit],[data-stem],[data-bus]'),
            id =
                element &&
                (element.getAttribute('data-bus') || element.getAttribute('data-nid') || element.getAttribute('data-hit') || element.getAttribute('data-stem')),
            target = id && findNode(tree, id)
        if (element?.hasAttribute('data-bus')) return onBus()
        if (!target) {
            // empty space: below the bus the bus counts, above it the circuit that is nearest sideways
            const busElement = sheetElement?.querySelector?.('[data-bus]')
            if (busElement && event.clientY > busElement.getBoundingClientRect().bottom) return onBus()
            let nearest = null
            sheetElement?.querySelectorAll?.('[data-hit]').forEach((hitArea) => {
                const box = hitArea.getBoundingClientRect(),
                    distance = event.clientX < box.left ? box.left - event.clientX : event.clientX > box.right ? event.clientX - box.right : 0,
                    circuit = findNode(tree, hitArea.getAttribute('data-hit'))
                if (circuit && (!nearest || distance < nearest.distance)) nearest = {distance, circuit, hitArea}
            })
            return nearest ? onCircuit(nearest.circuit, nearest.hitArea) : onBus()
        }
        const circuit = circuitOf(tree, target.id)
        if (!circuit) return onBus() // the head: the main line
        if (target.id === circuit.id) return onCircuit(circuit, element.hasAttribute('data-hit') ? element : null) // the circuit itself: its area, stem or letter
        if (makesCircuit) return onCircuit(circuit)
        const splitsInHalves = element.tagName.toLowerCase() !== 'text',
            box = element.getBoundingClientRect()
        return {id: target.id, mode: splitsInHalves && event.clientX < box.left + box.width / 2 ? 'before' : 'after', zone: 'element'}
    }
    const stopDrag = () => {
        setDraggedType(null)
        setDropTarget(null)
    }
    const onDragOver = (sheetNumber) => (event) => {
        if (!draggedType) return
        const target = dropTargetAt(event)
        if (!target) return dropTarget && setDropTarget(null)
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
        if (!dropTarget || dropTarget.id !== target.id || dropTarget.mode !== target.mode || dropTarget.sheetNumber !== sheetNumber)
            setDropTarget({...target, sheetNumber})
    }
    const onDragLeave = (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null)
    }
    const onDrop = (event) => {
        const target = dropTargetAt(event)
        if (!target) return stopDrag()
        event.preventDefault()
        insertSymbol(target.id, target.mode, draggedType)
        stopDrag()
    }
    // what the sheet would look like after the drop: the whole sheet is laid out again with the new element in it (drawn in blue)
    const dropPreview = (() => {
        if (!dropTarget || !draggedType) return null
        const ghost = {...newDroppedNode(draggedType), id: GHOST_ID},
            previewProject = {
                ...project,
                een: project.een.map((existing, index) => (index === pageIndex ? {...existing, tree: insertAt(tree, dropTarget.id, dropTarget.mode, ghost)} : existing)),
            },
            previewSheets = sheetPlan(previewProject, true).filter((sheet) => sheet.kind === 'een' && sheet.page === previewProject.een[pageIndex]),
            ghostSheet = previewSheets.findIndex((sheet) =>
                sheet.board.circuits.slice(sheet.slice.from, sheet.slice.to).some((circuit) => circuit.items.some((item) => item.id === GHOST_ID)),
            )
        // drawn: the new element is part of the sheet (and drawn in blue); not drawn (e.g. a differentieel): the place where it goes is marked in blue instead
        return {
            sheetNumber: dropTarget.sheetNumber,
            drawn: ghostSheet >= 0,
            sheet: previewSheets[ghostSheet >= 0 ? ghostSheet : Math.min(dropTarget.sheetNumber - 1, previewSheets.length - 1)],
        }
    })()
    const moveSelected = (move) => () => setTree(move(tree, selected.id))
    return (
        <div className="row">
            <div className="side ui pal sticky-side" data-tour="eds-palette" id="eds-palette">
                <SymbolPalette
                    symbolTypes={symbolTypes}
                    search={search}
                    onSearch={setSearch}
                    free={free}
                    onFreeChange={setFree}
                    onAdd={addFromPalette}
                    onDragStart={setDraggedType}
                    onDragEnd={stopDrag}
                />
                {selected && (
                    <PropertiesPanel
                        project={project}
                        node={selected}
                        swapTypes={swapTypes}
                        canInsertBefore={canInsertBefore}
                        canInsertAfter={canInsertAfter}
                        canAddBranch={canAddBranch}
                        onClose={() => setSelectedId(null)}
                        onLabelChange={(label) => updateSelected((node) => ({...node, label}))}
                        onTypeChange={changeType}
                        onPropertyChange={setProperty}
                        onInfoChange={(info) => updateSelected((node) => ({...node, info}))}
                        onInsertEmpty={insertEmpty}
                        onMoveEarlier={moveSelected((nodes, id) => moveNode(nodes, id, -1))}
                        onMoveLater={moveSelected((nodes, id) => moveNode(nodes, id, 1))}
                        onOutdent={moveSelected(outdentNode)}
                        onIndent={moveSelected(indentNode)}
                        onDuplicate={() => setTree(replaceNode(tree, selected.id, (node) => [node, ...withNewIds([node])]))}
                        onDelete={removeSelected}
                        onRotate={(degrees) => setTree(rotateNode(tree, selected.id, degrees))}
                    />
                )}
                <br />
                <b id="eds-tree-title">{t('oneWire.structure')}</b>
                <StructureTree
                    project={project}
                    tree={tree}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    folded={folded}
                    onToggleFold={toggleFold}
                />
            </div>
            <div className={draggedType ? 'main eds-dragging' : 'main'} ref={drawing}>
                {sheets.map((sheet) => (
                    <div
                        key={sheet.number}
                        id={`eds-sheet-${sheet.number}`}
                        style={{position: 'relative', width: zoom < 1 ? `${zoom * 100}%` : '100%', marginBottom: 10}}
                        onDragOver={onDragOver(sheet.number)}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                    >
                        <ZoomPane zoom={zoom} always>
                            <div style={{width: `${Math.max(zoom, 1) * 100}%`, position: 'relative'}}>
                                <BoardSheet
                                    project={project}
                                    board={sheet.board}
                                    slice={sheet.slice}
                                    number={sheet.number}
                                    total={sheet.total}
                                    selected={selectedId}
                                    onSelect={setSelectedId}
                                    onFooter={onFooter}
                                    onDelete={removeSelected}
                                    sheetId={`eds-sheet-${sheet.number}-drawing`}
                                />
                                {/* drop preview: the sheet as it would look after the drop, laid over the real one (which keeps receiving the drag events) */}
                                {dropPreview && dropPreview.sheetNumber === sheet.number && dropPreview.sheet && (
                                    <div id="eds-drop-preview" style={{position: 'absolute', inset: 0, background: '#fff', pointerEvents: 'none', zIndex: 2}}>
                                        <BoardSheet
                                            project={project}
                                            board={dropPreview.sheet.board}
                                            slice={dropPreview.sheet.slice}
                                            number={sheet.number}
                                            total={sheet.total}
                                            ghost={GHOST_ID}
                                            selected={!dropPreview.drawn && dropTarget.zone !== 'bus' ? dropTarget.id : null}
                                            busHighlighted={!dropPreview.drawn && dropTarget.zone === 'bus'}
                                            onFooter={onFooter}
                                        />
                                    </div>
                                )}
                            </div>
                        </ZoomPane>
                        <ZoomControls zoom={zoom} setZoom={setZoom} idPrefix={`eds-zoom-${sheet.number}`} className="ui zoomctl inset" />
                    </div>
                ))}
            </div>
        </div>
    )
}
