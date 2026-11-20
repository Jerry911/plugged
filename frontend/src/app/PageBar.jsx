// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
// The bar above the eendraadschema, the situatieschema or the bedradingsschema: one button per page, add / rename / duplicate / move / delete a page and,
// on the eendraadschema, the Controleer button.
import {defaultTree} from '../model/boardLayout.js'
import {newId, withNewIds} from '../model/tree.js'
import {emptyWiringPage} from '../model/wiring.js'
import {useTranslation} from '../i18n/I18nProvider.jsx'

// line icons in the colour of the text (yellow on the blue buttons), unlike the emoji ✎ and 🗑 that keep their own colours
const ICONS = {
    add: <path d="M12 5v14M5 12h14" />,
    rename: (
        <>
            <path d="M15.5 4.5l4 4L9 19H5v-4z" />
            <path d="M13 7l4 4" />
        </>
    ),
    duplicate: (
        <>
            <path d="M9 9h11v11H9z" />
            <path d="M5 15H4V4h11v1" />
        </>
    ),
    earlier: <path d="M15 5l-7 7 7 7" />,
    later: <path d="M9 5l7 7-7 7" />,
    delete: (
        <>
            <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13" />
            <path d="M10 11v6M14 11v6" />
        </>
    ),
}
const Icon = ({name}) => (
    <svg className="pageicon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[name]}
    </svg>
)

/**
 * listKey = 'een' (eendraadschema pages), 'sit' (situatieschema pages) or 'wire' (bedradingsschema pages); pageIndex = the page that is shown.
 * verify = {errorCount, warningCount, onToggle} shows the Controleer button.
 */
export default function PageBar({project, setProject, listKey, pageIndex, setPageIndex, verify}) {
    const {t} = useTranslation()
    const pages = project[listKey],
        idPrefix = {een: 'eds-page', sit: 'sit-page', wire: 'wire-page'}[listKey],
        setPages = (newPages) => setProject({...project, [listKey]: newPages})
    const swapWith = (offset) => {
        const reordered = [...pages]
        ;[reordered[pageIndex], reordered[pageIndex + offset]] = [reordered[pageIndex + offset], reordered[pageIndex]]
        setPages(reordered)
        setPageIndex(pageIndex + offset)
    }
    const newPage = () =>
        listKey === 'een'
            ? {id: newId(), name: t('pages.sheetName', {number: pages.length + 1}), tree: defaultTree()}
            : listKey === 'wire'
              ? emptyWiringPage(newId(), t('pages.wiringName', {number: pages.length + 1}))
              : {id: newId(), name: t('pages.planName', {number: pages.length + 1}), walls: [], items: []}
    const addPage = () => {
        setPages([...pages, newPage()])
        setPageIndex(pages.length)
    }
    const duplicatePage = () => {
        const page = pages[pageIndex],
            // the wires of a bedradingsschema stay attached to the copies of their symbols
            itemIds = new Map(listKey === 'een' ? [] : page.items.map((item) => [item.id, newId()])),
            copyEnd = (end) => (end?.item != null && itemIds.has(end.item) ? {...end, item: itemIds.get(end.item)} : end),
            copy =
                listKey === 'een'
                    ? {...page, tree: withNewIds(page.tree)}
                    : {
                          ...page,
                          walls: page.walls.map((wall) => ({...wall, id: newId()})),
                          items: page.items.map((item) => ({...item, id: itemIds.get(item.id)})),
                          ...(listKey === 'wire'
                              ? {
                                    wires: page.wires.map((wire) => ({...wire, id: newId(), a: copyEnd(wire.a), b: copyEnd(wire.b)})),
                                    boxes: page.boxes.map((box) => ({...box, id: newId()})),
                                }
                              : {}),
                      }
        setPages([...pages.slice(0, pageIndex + 1), {...copy, id: newId(), name: t('common.copyOf', {name: page.name})}, ...pages.slice(pageIndex + 1)])
        setPageIndex(pageIndex + 1)
    }
    const renamePage = () => {
        const name = prompt(t('pages.namePrompt'), pages[pageIndex].name)
        if (name) setPages(pages.map((page, index) => (index === pageIndex ? {...page, name} : page)))
    }
    const deletePage = () => {
        setPages(pages.filter((_, index) => index !== pageIndex))
        setPageIndex(Math.max(0, pageIndex - 1))
    }
    return (
        <div id={idPrefix + 'bar'} className="tb ui pagebar" data-tour="pagebar">
            {pages.map((page, index) => (
                <button key={page.id} id={`${idPrefix}-${index + 1}`} className={index === pageIndex ? 'on' : ''} onClick={() => setPageIndex(index)}>
                    {page.name}
                </button>
            ))}
            <button id={idPrefix + '-add'} onClick={addPage}>
                <Icon name="add" /> {t('pages.add')}
            </button>
            {verify && (
                <button id="btn-verify" onClick={verify.onToggle}>
                    {t('verify.button')}
                    {verify.errorCount ? ` ✖${verify.errorCount}` : ''}
                    {verify.warningCount ? ` ⚠${verify.warningCount}` : ''}
                </button>
            )}
            <button id={idPrefix + '-rename'} className="pageact" title={t('pages.rename')} aria-label={t('pages.rename')} onClick={renamePage}>
                <Icon name="rename" />
            </button>
            <button id={idPrefix + '-duplicate'} className="pageact" title={t('pages.duplicate')} aria-label={t('pages.duplicate')} onClick={duplicatePage}>
                <Icon name="duplicate" />
            </button>
            <button
                id={idPrefix + '-earlier'}
                className="pageact"
                title={t('pages.moveEarlier')}
                aria-label={t('pages.moveEarlier')}
                disabled={pageIndex < 1}
                onClick={() => swapWith(-1)}
            >
                <Icon name="earlier" />
            </button>
            <button
                id={idPrefix + '-later'}
                className="pageact"
                title={t('pages.moveLater')}
                aria-label={t('pages.moveLater')}
                disabled={pageIndex >= pages.length - 1}
                onClick={() => swapWith(1)}
            >
                <Icon name="later" />
            </button>
            <button id={idPrefix + '-delete'} className="pageact" title={t('pages.delete')} aria-label={t('pages.delete')} disabled={pages.length < 2} onClick={deletePage}>
                <Icon name="delete" />
            </button>
        </div>
    )
}
