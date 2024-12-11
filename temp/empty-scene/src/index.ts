import {
  EasingFunction,
  engine,
  GltfContainer,
  Transform,
  Tween,
  TweenLoop,
  TweenSequence,
} from '@dcl/sdk/ecs'
import { getSceneInformation } from "~system/Runtime";
import { setupUI } from "./ui/ui";
import { Vector3 } from '@dcl/ecs-math';

export let plotSize:number = 0

export function main() {
  setupUI()

  getInfo().then(()=>{
    setFloor()
  })
}

async function getInfo(){
  const sceneInfo = await getSceneInformation({})
  if (!sceneInfo) return

  const sceneJson = JSON.parse(sceneInfo.metadataJson)
  console.log("scene json is", sceneJson)

  plotSize = sceneJson.iwb
}

export function formatDollarAmount(amount: number, decimal?:number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: decimal ? decimal : 0 });
}

function setFloor(){
  let ent = engine.addEntity()
  GltfContainer.create(ent, {src:'assets/86e1ec9f-30e8-4103-81ce-2253413c219d.glb'})
  Transform.create(ent, {scale:Vector3.create(4 * plotSize,1,4 * plotSize), position: Vector3.create(16 * plotSize,0, 16 * plotSize)})


  let anim = engine.addEntity()
  GltfContainer.create(anim, {src:"assets/be0e5046-4215-48a3-bc3e-ddb8d6e9d305.glb"})
  Transform.create(anim, {scale: Vector3.create(plotSize,1,plotSize)})

  Tween.create(anim, {
    mode: Tween.Mode.Move({
      start: Vector3.create(16 * plotSize / 2,0, 16 * plotSize / 2),
      end: Vector3.create(16 * plotSize / 2,16, 16 * plotSize / 2),
    }),
    duration: 2000,
    easingFunction: EasingFunction.EF_LINEAR,
  })
  
  TweenSequence.create(anim, { sequence: [], loop: TweenLoop.TL_RESTART })
}