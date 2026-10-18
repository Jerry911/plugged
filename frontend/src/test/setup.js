// Copyright 2026 pleysje
// SPDX-License-Identifier: AGPL-3.0-only
import '@testing-library/jest-dom/vitest'
// jsdom lacks SVG geometry + PointerEvent: minimal polyfills so clientX/clientY map 1:1 to SVG user units.
const P=window.SVGSVGElement.prototype
P.createSVGPoint=function(){return{x:0,y:0,matrixTransform(){return{x:this.x,y:this.y}}}}
P.getScreenCTM=function(){return{inverse:()=>({})}}
if(!window.PointerEvent){window.PointerEvent=class extends MouseEvent{}}
