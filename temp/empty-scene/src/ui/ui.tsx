import {
  engine,
  Transform,
  UiCanvasInformation,
} from '@dcl/sdk/ecs'
import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { uiSizer } from './helpers'
import { createInfoPanel } from './Objects/infoPanel'

export function setupUI() {
    ReactEcsRenderer.setUiRenderer(uiComponent)
    engine.addSystem(uiSizer)
}

export let uiInput:boolean = false
export function setUIClicked(value:boolean){
    uiInput = value
}

const uiComponent:any = () => [
  createInfoPanel()
]