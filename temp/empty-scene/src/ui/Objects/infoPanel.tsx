import ReactEcs, {UiEntity} from '@dcl/sdk/react-ecs'
import {
    calculateImageDimensions,
    calculateSquareImageDimensions,
    getAspect,
    getImageAtlasMapping,
    sizeFont
} from '../helpers';
import {Color4} from '@dcl/sdk/math';
import {uiSizes} from '../uiConfig';
import { formatDollarAmount, plotSize } from '../../index'
import { teleportTo } from '~system/RestrictedActions';

export let show = true

export function displayPanel(value: boolean) {
    show = value;
}

export function createInfoPanel() {
    return (
        <UiEntity
            key={"iwb-deploy-info-panel"}
            uiTransform={{
                display: show ? 'flex' : 'none',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: calculateImageDimensions(25, 345 / 511).width,
                height: calculateImageDimensions(25, 345 / 511).height,
                positionType: 'absolute',
                position: {right: '3%', bottom: '3%'}
            }}
            uiBackground={{
                textureMode: 'stretch',
                texture: {
                    src: 'images/atlas1.png',
                },
                uvs: getImageAtlasMapping(uiSizes.vertRectangleOpaque)
            }}
        >

<UiEntity
    uiTransform={{
        display: 'flex',
        flexDirection: 'column',
        width: '80%',
        height: '90%',
    }}
>
<UiEntity
    uiTransform={{
        display: 'flex',
        flexDirection: 'column',
        width: '90%',
        height: '20%',
    }}
    uiText={{
        value: 'IWB Deployable Land',
        fontSize: sizeFont(35, 20),
        textAlign: 'middle-center'
    }}
/>

<UiEntity
    uiTransform={{
        display: 'flex',
        flexDirection: 'column',
        width: '90%',
        height: '10%',
    }}
    uiText={{
        value: 'SIZE: ' + plotSize + "x" + plotSize,
        fontSize: sizeFont(35, 25),
        textAlign: 'middle-left'
    }}
/>

<UiEntity
    uiTransform={{
        display: 'flex',
        flexDirection: 'column',
        width: '90%',
        height: '20%',
    }}
    uiText={{
        value: 'Reserve this land today! Visit the Shrouded Wanderer at the Angzaar Colosseum to make your reservation today!',
        fontSize: sizeFont(25, 20),
        textAlign: 'middle-left'
    }}
/>

<UiEntity
    uiTransform={{
        display: 'flex',
        flexDirection: 'column',
        width: '90%',
        height: '10%',
    }}
    uiText={{
        value: 'Parcels: ' + (plotSize * plotSize),
        fontSize: sizeFont(25, 15),
        textAlign: 'middle-left'
    }}
/>

<UiEntity
    uiTransform={{
        display: 'flex',
        flexDirection: 'column',
        width: '90%',
        height: '10%',
    }}
    uiText={{
        value: 'File Size: ' + ((plotSize * plotSize) * 15 > 300 ? 300 : (plotSize * plotSize) * 15) + "MB",
        fontSize: sizeFont(25, 15),
        textAlign: 'middle-left'
    }}
/>

<UiEntity
    uiTransform={{
        display: 'flex',
        flexDirection: 'column',
        width: '90%',
        height: '10%',
    }}
    uiText={{
        value: 'Poly Count: ' + formatDollarAmount((plotSize * plotSize) * 10 * 1000),
        fontSize: sizeFont(25, 15),
        textAlign: 'middle-left'
    }}
/>

<UiEntity
      uiTransform={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: calculateImageDimensions(12, getAspect(uiSizes.buttonPillBlue)).width,
          height: calculateImageDimensions(8,getAspect(uiSizes.buttonPillBlue)).height,
          margin: {top:"1%", bottom:'1%'},
      }}
      uiBackground={{
          textureMode: 'stretch',
          texture: {
              src: 'images/atlas2.png'
          },
          uvs: getImageAtlasMapping({
            atlasHeight: 1024,
            atlasWidth: 1024,
            sourceTop: 924,
            sourceLeft: 0,
            sourceWidth: 117.65,
            sourceHeight: 50
        })
      }}
      onMouseDown={() => {
        teleportTo({worldCoordinates:{x:2,y:-86}})
      }}
      uiText={{textWrap:'nowrap',  value:"Reserve", color:Color4.White(), fontSize:sizeFont(30, 20)}}
      />

</UiEntity>

        </UiEntity>
    );
}