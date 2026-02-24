// index.js
const app = getApp();
const fs = wx.getFileSystemManager();
// expire in 2026-03-26, please contact support@dynamsoft.com to get new
// please provide your `appid` when you need to purchase a commercial license
const dbrLicense = "t0068MgAAAGHAyiF44x2axM44fSAxDusqEW2uAKmb1SpjnsemtL1/ggg5TM2ix4dOBlXVkcIerBc1Xdy2M+A4p1Cw04N0iKM=";
let BarcodeReader; // usable after call `funcInitDBR()`

Page({
  data: {
    resultTxts: [],
    bPlayingVideo: false,
  },
  cameraFramelistener: undefined,
  bACameraFrameDecoding: false, // avoid continue decoding when one frame not finish
  noBarcodeLoopCount: 0,
  async onLoad() {
    await funcInitDBR();
  },

  async decodeImage() {
    this.setData({resultTxts: []});
    const resultTxts = [];
    const res = await wx.chooseMedia({
      mediaType: ['image'],
      //// if you don't want compressed images
      //// e.g. reading small barcodes from scanned documents
      // sizeType: ['original'], 
    });
    const canvas = wx.createOffscreenCanvas({ type: '2d' });
    const img = canvas.createImage();
    const ctx = canvas.getContext('2d');
    for(const {tempFilePath} of res.tempFiles){
      await new Promise((rs,rj)=>{
        img.onload = rs;
        img.onerror = rj;
        img.src = tempFilePath;
      });
      const width = canvas.width = img.width;
      const height = canvas.height = img.height;
      ctx.drawImage(img, 0, 0, width, height);
      const buffer = ctx.getImageData(0, 0, width, height).data.buffer;
      const result = await BarcodeReader.capture(
        { bytes: buffer, width, height, stride: width * 4, format: 10 },
        // or ReadSingleBarcode ReadBarcodes_Balance ReadBarcodes_ReadRateFirst ReadDenseBarcodes ReadDistantBarcodes
        'ReadBarcodes_SpeedFirst'
      );
      //console.log(result);// debug
      if(result?.items?.length){
        for(let {text} of result.items){
          resultTxts.push(text);
        }
      }else if(result.errorCode){
        console.error(`decode barcode errorCode: ${result.errorCode}, errorString ${result.errorString}`);
      }
    }
    //console.log(resultTxts);// debug
    if(!resultTxts.length){ resultTxts.push('No barcode found!'); }
    this.setData({resultTxts});
  },

  // ====!!!! The emulator cannot work !!!!====
  // `onCameraFrame` works on a real mobile
  async startDecodeVideo(){
    await new Promise(rs=>{this.setData({bPlayingVideo: true}, rs)});
    console.log('showed camera component'); // debug

    // canvas cover on camera
    let canvas;
    let cvsCtx;
    let cvsRenderWidth;
    let cvsRenderHeight;
    const queryCanvas = this.createSelectorQuery();
    const nRefCanvas = queryCanvas.select('#cvs-cover-on-camera');
    await new Promise(rs=>{
      nRefCanvas.fields({ node: true, size: true });
      nRefCanvas.boundingClientRect();
      queryCanvas.exec((res) => {
        canvas = res[0].node;
        cvsCtx = canvas.getContext('2d');
        cvsRenderWidth = res[1].width;
        cvsRenderHeight = res[1].height;
        rs();
      });
    });
    console.log('success get canvas'); // debug
    
    const cameraCtx = wx.createCameraContext();
    console.log('success get CameraContext'); // debug
    const bIOS = 'ios' === wx.getDeviceInfo().platform;

    this.cameraFramelistener = cameraCtx.onCameraFrame(async ({width, height, data}) => {
      if(this.bACameraFrameDecoding){ return; }
      if(!width || !height){ return; }
      //console.log('enter onCameraFrame'); // debug

      this.bACameraFrameDecoding = true;
      let result;
      try{
        result = await BarcodeReader.capture(
          { bytes: bIOS ? undefined : data, width, height, stride: width * 4, format: 10 },
          // or ReadSingleBarcode ReadBarcodes_Balance ReadBarcodes_ReadRateFirst ReadDenseBarcodes ReadDistantBarcodes
          'ReadBarcodes_SpeedFirst'
        );
      }catch(ex){
        console.error(ex);
      }
      this.bACameraFrameDecoding = false;

      if(!result?.items?.length){
        if(result.errorCode !== 0 && result.errorCode !== -10026){ // 10026 is timeout
          console.error(`decode barcode errorCode: ${result.errorCode}, errorString ${result.errorString}`);
        }
        // clear overlayer
        if(++this.noBarcodeLoopCount > 3){
          cvsCtx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }
      this.noBarcodeLoopCount = 0;

      const resultTxts = [];
      //console.log(result);// debug
      for(let {text} of result.items){
        resultTxts.push(text);
      }
      //console.log(resultTxts);// debug
      // if no barcode found, do not replace existed txts
      if(resultTxts.length){
        this.setData({resultTxts});
      }

      // draw overlayer
      {
        // the frame show in VideoComponent is `object-fit:cover`
        // so we need to cut some part when draw overlayer
        let leftCut = 0, topCut = 0; 
        if(width / height > cvsRenderWidth / cvsRenderHeight){
          leftCut = (width - height / cvsRenderHeight * cvsRenderWidth) / 2;
        }else if(width / height < cvsRenderWidth / cvsRenderHeight){
          topCut = (height - width / cvsRenderWidth * cvsRenderHeight) / 2;
        }
        // canvas size limit and to workaround crash problem
        // we limit to 300 here, max can be 1365
        const maxCvsWH = 300;
        let cvsRate;
        {
          let cvsW = width - leftCut * 2, cvsH = height - topCut * 2;
          if(cvsW > maxCvsWH || cvsH > maxCvsWH){
            if(cvsW > cvsH){
              cvsRate = maxCvsWH / cvsW;
              canvas.width = maxCvsWH;
              canvas.height = Math.round(cvsH / cvsW * maxCvsWH);
            }else{
              cvsRate = maxCvsWH / cvsH;
              canvas.height = maxCvsWH;
              canvas.width = Math.round(cvsW / cvsH * maxCvsWH);
            }
          }
        }
        //console.log(`cvsRenderWidth ${cvsRenderWidth}, cvsRenderHeight ${cvsRenderHeight}, canvas.width ${canvas.width}, canvas.height ${canvas.height}, cvsRate ${cvsRate}`); // debug
        cvsCtx.clearRect(0, 0, canvas.width, canvas.height);
        cvsCtx.fillStyle = 'rgba(0,255,0,0.5)';
        cvsCtx.strokeStyle = 'rgba(0,255,0,1)';
        cvsCtx.lineWidth = 1;
        for(let {location} of result.items){
          let p = location.points;
          cvsCtx.beginPath();
          cvsCtx.moveTo((p[0].x - leftCut) * cvsRate, (p[0].y - topCut) * cvsRate);
          cvsCtx.lineTo((p[1].x - leftCut) * cvsRate, (p[1].y - topCut) * cvsRate);
          cvsCtx.lineTo((p[2].x - leftCut) * cvsRate, (p[2].y - topCut) * cvsRate);
          cvsCtx.lineTo((p[3].x - leftCut) * cvsRate, (p[3].y - topCut) * cvsRate);
          cvsCtx.fill();
          cvsCtx.closePath();
          cvsCtx.stroke();
        }
      }
    });

    console.log('success add cameraFramelistener'); // debug

    this.cameraFramelistener.start(bIOS ? { worker: BarcodeReader.worker }: {});
    console.log('success start cameraFramelistener'); // debug
  },

  stopDecodeVideo(){
    this.cameraFramelistener?.stop();
    this.cameraFramelistener = null;
    this.setData({bPlayingVideo: false});
  },
  onCameraStopUnexpectly(e){
    console.log(e.detail);
    this.stopDecodeVideo();
    wx.showToast({ title: 'Camera stop unexpectly', icon: 'none', duration: 3000 });
  },
  onCameraPermissionError(e){
    console.log(e.detail);
    this.stopDecodeVideo();
    wx.showToast({ title: 'Camera permission error', icon: 'none', duration: 3000 });
  },
})

let pInitDBR; // promise of init DBR, to avoid multiple initializations
const funcInitDBR = ()=>{ // can call this func multiple times, it only init once
  return (pInitDBR = pInitDBR || _funcInitDBR());
}
const _funcInitDBR = async()=>{ // this func will only be called once
  wx.showLoading({ title: 'loading dbr subpackage...' });
  BarcodeReader = (await require.async('@dbr/BarcodeReader.js')).default;

  wx.showLoading({ title: 'loading workers subpackage...' });
  await new Promise((success, fail)=>{
    wx.preDownloadSubpackage({
      packageType: "workers",
      success,
      fail,
    });
  });

  wx.showLoading({ title: 'init worker and wasm...' });
  await BarcodeReader.loadWasm("workers/dbr.worker.js", "dbr/dynamsoft-barcode-reader-bundle-ml-simd.wasm.br");

  wx.showLoading({ title: 'init BarcodeReader license...' });
  console.log('init BarcodeReader license...');//debug
  await BarcodeReader.initLicense(dbrLicense);
  
  // optional: add AI model
  wx.showLoading({ title: 'loading dbr-ai-model subpackage...' });
  console.log('loading dbr-ai-model subpackage...');//debug
  await require.async('@dbr-ai-model/index.js');
  wx.showLoading({ title: 'init AI model...' });
  console.log('init AI model...');//debug
  for (const name of ["Code128Decoder", "EAN13Decoder"]) {
    try {
      const buffer = fs.readFileSync(`dbr-ai-model/${name}.br`);
      await BarcodeReader.appendModel(name, buffer);
    } catch (e) {
      console.error(`Failed to init AI model ${name}`);
    }
  }

  console.log('BarcodeReader is ready');//debug
  wx.hideLoading()
};
