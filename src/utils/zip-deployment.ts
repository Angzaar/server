import path from "path";
import { unzip } from "./deployment";
import { TEMP_LOCATION } from "./initializer";
import { ContentClient, DeploymentBuilder, createCatalystClient, createContentClient, } from 'dcl-catalyst-client'
import ignore from 'ignore'
import { mainRooms } from "../rooms";
import { MainRoom, Player } from "../rooms/MainRoom";
import { ChainId, getChainName, EntityType } from '@dcl/schemas'
import { Authenticator } from '@dcl/crypto'
import { getCatalystServersFromCache } from 'dcl-catalyst-client/dist/contracts-snapshots'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { spawn } from 'child_process'
import { removeTempFile } from "./upload";

export const npm = /^win/.test(process.platform) ? 'npm.cmd' : 'npm'

const fs = require('fs-extra');

export let pendingDeployments:any = {}

export interface IFile {
    path: string
    content: Buffer
    size: number
}

export async function deployZip(userId:string, fileId:string){
    try{
        fs.mkdirSync(path.join(TEMP_LOCATION, fileId), { recursive: true });
        await fs.ensureDir(path.join(TEMP_LOCATION, fileId));
        await unzip(path.join(TEMP_LOCATION, fileId + ".zip"), path.join(TEMP_LOCATION, fileId));
        removeTempFile(path.join(TEMP_LOCATION, fileId + ".zip"))

        console.log(`Unzipped to deploy directory`);

        await runNpmInstall({
            workingDir: path.join(TEMP_LOCATION, fileId), 
          })

        await buildTypescript({
            workingDir: path.join(TEMP_LOCATION, fileId), 
            watch:false, 
            production: true
          })

        //   // Obtain list of files to deploy//
        const originalFilesToIgnore = await fs.readFile(
            path.join(TEMP_LOCATION, fileId) + '/.dclignore',
            'utf8'
          )

        const files: IFile[] = await getFiles({
        ignoreFiles: originalFilesToIgnore,
        skipFileSizeCheck: false,
        }, path.join(TEMP_LOCATION, fileId))

        const contentFiles = new Map(files.map((file) => [file.path, file.content]))

        const sceneJson = await getSceneFile(path.join(TEMP_LOCATION, fileId))

        const { entityId, files: entityFiles } = await DeploymentBuilder.buildEntity({
            type: EntityType.SCENE,
            pointers:findPointers(sceneJson),
            files: contentFiles,
            metadata: sceneJson
        })

        // console.log(entityId)
        mainRooms.forEach((room:MainRoom)=>{
            room.state.players.forEach((player:Player)=>{
                if(player.userId === userId){
                    player.client.send('sign', entityId)
                }
            })
        })

        pendingDeployments[userId] = {
            entityFiles: entityFiles,
            entityId: entityId,
            directory: path.join(TEMP_LOCATION, fileId)
        }

        pendingDeployments[userId].timer = setTimeout(()=>{
          clearTimeout(pendingDeployments[userId].timer)
          deleteDirectory(userId)
          delete pendingDeployments[userId]
        }, 1000 * 60)

        // console.log('pending deployments', pendingDeployments)

    }
    catch(e:any){
        console.log('error deploying zip file', e)
        deleteDirectory(userId)
    }
}



export function findPointers(sceneJson: any): string[] {
    return sceneJson.scene.parcels
  }

/**
   * Returns a promise of an array of objects containing the path and the content for all the files in the project.
   * All the paths added to the `.dclignore` file will be excluded from the results.
   * Windows directory separators are replaced for POSIX separators.
   * @param ignoreFile The contents of the .dclignore file
   */
export async function getFiles({
    ignoreFiles = '',
    cache = false,
    skipFileSizeCheck = false,
  }: {
    ignoreFiles?: string
    cache?: boolean
    skipFileSizeCheck?: boolean
  } = {}, bucketDirectory:string): Promise<IFile[]> {

    // console.log('ignored files are ', ignoreFiles)

    const files = await getAllFilePaths(bucketDirectory, bucketDirectory)
    const filteredFiles = (ignore as any)()
      .add(ignoreFiles.split(/\n/g).map(($) => $.trim()))
      .filter(files)
    const data = []

    for (let i = 0; i < filteredFiles.length; i++) {
      const file = filteredFiles[i]
      const filePath = path.resolve(bucketDirectory, file)
      const stat = await fs.stat(filePath)

    //   if (stat.size > Project.MAX_FILE_SIZE_BYTES && !skipFileSizeCheck) {
    //     fail(
    //       ErrorType.UPLOAD_ERROR,
    //       `Maximum file size exceeded: '${file}' is larger than ${
    //         Project.MAX_FILE_SIZE_BYTES / 1e6
    //       }MB`
    //     )
    //   }

      const content = await fs.readFile(filePath)
      // console.log('file is', filePath)

      data.push({
        path: file.replace(/\\/g, '/'),
        content: Buffer.from(content),
        size: stat.size
      })
    }
    // this.files = data
    return data
  }

 /**
   * Returns a promise of an array containing all the file paths for the given directory.
   * @param dir The given directory where to list the file paths.
   */
 async function getAllFilePaths(dir:string, rootFolder:string): Promise<string[]> {
    try {
      const files = await fs.readdir(dir)
      let tmpFiles: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const filePath = path.resolve(dir, file)
        const relativePath = path.relative(rootFolder, filePath)
        const stat = await fs.stat(filePath)

        if (stat.isDirectory()) {
          const folderFiles = await getAllFilePaths(
            filePath,
            rootFolder
          )
          tmpFiles = tmpFiles.concat(folderFiles)
        } else {
          tmpFiles.push(relativePath)
        }
      }

      return tmpFiles
    } catch (e) {
      return []
    }
  }


  export async function getSceneFile(
    workingDir: string,
    cache: boolean = true
  ): Promise<any> {
    // if (cache && sceneFile) {
    //   return sceneFile
    // }
  
    return await fs.readJSON(path.resolve(workingDir, 'scene.json'))
  
  }


  export async function pingCatalyst(req:any, res:any){//entityId:any, address:any, signature:any){
    if(validateSignature(req)){
      console.log('valid signature, pinging catalyst for upload', req.body)
      let entityId = pendingDeployments[req.body.user.toLowerCase()].entityId
      let address = req.body.user.toLowerCase()
      let signature = req.body.signature
      let target:any
      if(req.body.target){
        target = req.body.target
        console.log("target is", target)
      }
  
      const authChain = Authenticator.createSimpleAuthChain(
          entityId,
          address,
          signature
      )
  
      // Uploading data
    let catalyst: ContentClient | null = null
    let url = ''
  
  //   if (args['--target']) {
  //     let target = args['--target']
  //     if (target.endsWith('/')) {
  //       target = target.slice(0, -1)
  //     }
  //     catalyst = await createCatalystClient({
  //       url: target,
  //       fetcher: createFetchComponent()
  //     }).getContentClient()
  //     url = target
  //   } else if (args['--target-content']) {
  //     const targetContent = args['--target-content']
  //     catalyst = createContentClient({
  //       url: targetContent,
  //       fetcher: createFetchComponent()
  //     })
  //     url = targetContent
  //   } else if (chainId === ChainId.ETHEREUM_SEPOLIA) {
  //     catalyst = await createCatalystClient({
  //       url: 'peer.decentraland.zone',
  //       fetcher: createFetchComponent()
  //     }).getContentClient()
  //     url = 'peer.decentraland.zone'
  //   } else {

  if(req.body.dest === "worlds" || req.body.dest === "dclname"){
      catalyst = createContentClient({
        url: target,
        fetcher: createFetchComponent()
      })
  }
  else{
    target = undefined
      if(target){
          catalyst = await createCatalystClient({
              url: target,
              fetcher: createFetchComponent()
            }).getContentClient()
      }else{
      const cachedCatalysts = getCatalystServersFromCache('mainnet')
      for (const cachedCatalyst of cachedCatalysts) {
        const client = createCatalystClient({
          url: cachedCatalyst.address,
          fetcher: createFetchComponent()
        })
  
        const {
          healthy,
          content: { publicUrl }
        } = await client.fetchAbout()
  
        if (healthy) {
          catalyst = await client.getContentClient()
          url = publicUrl
          break
        }
      }
      }
    }
  
    if (!catalyst) {
      console.log('Could not find a up catalyst')
      res.status(200).json({valid: false, msg:"invalid catalyst"})
      return
    }
  
    console.log(`Uploading data to: ${url}`)
  
    const deployData = { entityId, files: pendingDeployments[req.body.user].entityFiles, authChain }
    // const position = pendingDeployments[req.body.user].sceneJSON.scene.base
    // const network = 'mainnet'
    // const worldName = pendingDeployments[req.body.user].sceneJSON.worldConfiguration?.name
    // const worldNameParam = worldName ? `&realm=${worldName}` : ''
    // const sceneUrl = `https://play.decentraland.org/?NETWORK=${network}&position=${position}&${worldNameParam}`
  
      try {
        const response = (await catalyst.deploy(deployData, {
          timeout: 600000
        })) as { message?: string }
        // project.setDeployInfo({ status: 'success' })
        console.log(`Content uploaded.`)// ${chalk.underline.bold(sceneUrl)}\n`)
        res.status(200).json({valid:true})
    
        if (response.message) {
          console.log(response.message)
        }

        mainRooms.forEach((room:MainRoom)=>{
            room.state.players.forEach((player:Player)=>{
                if(player.userId === req.body.user){
                    player.client.send('deploy-success', {})
                }
            })
        })
        deleteDirectory(req.body.user)
        
      } catch (error: any) {
        console.log('\n' + error.stack)
        console.log('Could not upload content', error)
        mainRooms.forEach((room:MainRoom)=>{
            room.state.players.forEach((player:Player)=>{
                if(player.userId === req.body.user){
                    player.client.send('deploy-fail', {})
                }
            })
        })
        deleteDirectory(req.body.user)
      }
    }else{
      console.log('cannot validate message from signature request')
      mainRooms.forEach((room:MainRoom)=>{
        room.state.players.forEach((player:Player)=>{
            if(player.userId === req.body.user){
                player.client.send('deploy-fail', {})
            }
            })
        })
        deleteDirectory(req.body.user)
    }
}

function validateSignature(req:any){
    if(req.body && 
      req.body.user && 
      req.body.signature && 
      req.body.entityId && 
      pendingDeployments[req.body.user.toLowerCase()] &&
      pendingDeployments[req.body.user.toLowerCase()].entityId === req.body.entityId
          ){
      return true
    }else{
      return false
    }
  }

  async function deleteDirectory(user:any){
    try{
        if(pendingDeployments[user]){
            clearTimeout(pendingDeployments[user].timer)
        }
      await fs.rmdirSync(pendingDeployments[user].directory, { recursive: true })
      delete pendingDeployments[user]
    }
    catch(e:any){
      console.log('unable to delete directory', e)
    }
  }

  export function buildTypescript({
    workingDir,
    watch,
    production,
    silence = false
  }: {
    workingDir: string
    watch: boolean
    production: boolean
    silence?: boolean
  }): Promise<void> {
    const command = watch ? 'watch' : 'build -- -p'
    const NODE_ENV = production ? 'production' : ''
  
    return new Promise((resolve, reject) => {
      const child = spawn(npm, ['run', command], {
        shell: true,
        cwd: workingDir,
        env: { ...process.env, NODE_ENV }
      })
  
      if (!silence) {
        child.stdout.pipe(process.stdout)
        child.stderr.pipe(process.stderr)
      }
  
      child.stdout.on('data', (data) => {
        if (
          data.toString().indexOf('The compiler is watching file changes...') !==
          -1
        ) {
          if (!silence) console.log('Project built.')
          return resolve()
        }
      })
  
      child.on('close', (code) => {
        if (code !== 0) {
          const msg = 'Error while building the project'
          if (!silence)  console.log(msg)
          reject(new Error(msg))
        } else {
          if (!silence)  console.log('Project built.')
          return resolve()
        }
      })
    })
  }

  export function runNpmInstall({
    workingDir,
    silence = false,
  }: {
    workingDir: string;
    silence?: boolean;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("npm", ["install"], {
        shell: true,
        cwd: workingDir,
        env: { ...process.env },
      });
  
      if (!silence) {
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
      }
  
      child.on("close", (code) => {
        if (code !== 0) {
          const msg = "Error while running npm install";
          if (!silence) console.log(msg);
          reject(new Error(msg));
        } else {
          if (!silence) console.log("npm install completed successfully.");
          resolve();
        }
      });
    });
  }