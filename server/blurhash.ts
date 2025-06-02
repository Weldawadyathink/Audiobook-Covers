import { decode, encode } from "blurhash";
// import sharp from "sharp";

export { isBlurhashValid } from "blurhash";

// https://www.npmjs.com/package/use-next-blurhash

export function getBlurhashUrl(inputHash: string) {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAQK0lEQVR4AQEgEN/vAEZHPv9GRz7/Rkc9/0VGO/9FRTn/REQ3/0RDNP9EQjH/REEt/0RAKf9FQCb/Rj8j/0c/IP9JPx//Sj8e/0xAHv9NQB//TkEh/09BI/9PQib/T0Io/05CK/9NQi3/TEIv/0pBMf9HQTP/RUA0/0I/Nf8/Pzb/PT42/zs+N/86PTf/AEZIP/9GSD//Rkc+/0VHPP9FRjv/RUU4/0RENf9EQzL/REIv/0VBK/9FQSj/RkAl/0hAIv9JQCH/SkAg/0xAIP9NQSH/TkEi/09BJP9PQif/T0Ip/05CK/9NQi7/TEIw/0pCMv9HQTP/RUE1/0JANv9APzf/PT83/zs+OP86Pjj/AEdKQv9HSkL/RkpB/0ZJQP9GSD7/RUc8/0VHOf9FRjf/RUUz/0VEMP9GQy3/R0Iq/0hCKP9JQib/S0Il/0xCJP9NQiT/TkIl/09CJ/9PQin/T0Mr/05DLf9NQzD/TEMy/0pCNP9IQjX/RUI3/0NCOP9AQTn/PkE6/z1BO/87QTv/AEhNR/9ITUf/R01G/0dMRf9HTET/R0tC/0ZKP/9GST3/R0k6/0dIN/9HRzT/SEYy/0lFL/9KRS3/S0Qr/01EKv9NRCr/TkMq/09DK/9PQyz/T0Mu/05EMP9NRDL/TEQ1/0pEN/9IRDn/RkQ7/0REPP9CRD7/QEQ//z9EP/8+RED/AElRTf9JUU3/SVFM/0lRS/9JUEr/SFBI/0hPRv9ITkT/SE1C/0lMP/9JSzz/Sko6/0tJN/9LSDX/TEcz/01HMf9ORjD/TkUw/09FMP9PRTH/T0Uy/05FNP9NRTb/TEU4/0tGO/9JRj3/R0c//0VHQf9ESEP/QkhE/0FIRf9ASEb/AEtWVP9LVlP/S1ZT/0tWUv9LVVH/SlVQ/0pUTv9KU0z/S1JK/0tRR/9LUEX/TE9C/0xOP/9NTD3/TUs6/05KOP9PSTf/T0g2/09HNf9PRzb/T0Y3/05HOP9ORzr/TUg9/0tIP/9KSUL/SUpE/0dLRv9GTEj/RUxK/0RNS/9DTUz/AE1cWv9NXFr/TVta/01bWf9NW1j/TVpX/01aVf9NWVP/TVhR/01XT/9NVUz/TlRJ/05SR/9OUUT/T09B/09NP/9PTD3/UEs7/1BKO/9QSTv/T0k8/09JPf9OST//TUpB/0xLRP9LTEf/Sk5J/0lPTP9IUE7/SFFQ/0dSUf9HU1L/AFBhYf9QYWH/UGFg/1BgYP9QYF//UGBe/1BfXP9QXlr/UF1Y/1BcVv9QWlP/UFhQ/1BXTf9QVUr/UFNI/1FRRf9RT0P/UU5B/1FMQP9QTED/UEtA/1BLQv9PTET/T01G/05PSf9NUEz/TVJP/0xTUf9LVVT/S1ZW/0pXV/9KWFj/AFJmZ/9SZmf/UmZn/1JmZv9SZWX/UmVk/1JkYv9SY2D/UmJe/1JgXP9SX1n/Ul1W/1JbU/9SWVD/UlZN/1JUSv9SUkj/UlFG/1JPRf9ST0X/UU5F/1FPRv9RT0j/UFFL/1BSTv9PVFH/T1ZU/05YV/9OWVn/Tltb/05cXf9NXV7/AFVrbf9Va23/VWtt/1VrbP9Vamv/VWlp/1VpaP9VZ2b/VWZj/1VkYf9VY17/VWBb/1ReWP9UXFX/VFpR/1RYT/9UVkz/VFRK/1RTSf9UUkn/U1JK/1NSS/9TU03/UlRQ/1JWU/9SWFb/UVpZ/1FcXP9RXl7/UV9g/1FgYv9QYWP/AFhwc/9YcHL/WHBy/1hvcf9Yb3D/WG5u/1htbP9Xa2r/V2po/1doZf9XZmL/V2Rf/1dhW/9XX1j/Vl1V/1ZbUv9WWVD/VldO/1ZWTf9WVU3/VlVO/1VWT/9VV1L/VVhU/1VaV/9UXFr/VF5d/1RgYP9UYmP/VGNl/1NlZv9TZWf/AFt0d/9bdHf/W3R2/1tzdf9bcnT/WnFy/1pwcP9abm7/Wm1r/1lraP9ZaGX/WWZh/1lkXv9ZYVv/WV9Y/1hdVf9YW1P/WFpR/1hZUf9YWVH/WFlS/1haU/9YW1b/WF1Y/1heW/9XYF7/V2Jh/1dkZP9WZmb/Vmdo/1Zoav9WaWv/AF54e/9eeHv/Xnh6/153ef9ddnf/XXR1/1xzc/9ccXD/XG9t/1ttav9bamb/W2hj/1tmX/9bY1z/W2FZ/1tfV/9bXlX/W11U/1tdVP9bXVT/W11V/1teV/9bX1r/W2Fc/1piX/9aZGL/WmZl/1loZ/9ZaWr/WWpr/1hrbf9YbG7/AGF8fv9he37/YHt9/2B6fP9geXr/X3d4/151df9ec3L/XXBu/11ua/9ca2f/XGlj/1xnYP9cZV3/XWNa/11hWP9dYFb/XmBW/15gVv9eYFf/XmFY/15iW/9eY13/XmVg/11mYv9daGX/XGlo/1xrav9bbGz/W21u/1pub/9abnD/AGN+gf9jfoH/Y32A/2J8fv9ie3z/YXl5/2B2dv9fdHL/X3Fv/15va/9ebGf/Xmpj/15nX/9eZVz/XmRa/19jWP9gYlf/YGJX/2FjWP9hY1n/YWRb/2FlXf9hZ2D/YWhj/2BqZf9ga2j/X2xq/15ubP9db27/XG9w/1xwcf9bcHH/AGWAg/9lgIL/ZX+B/2R+f/9jfH3/Ynp6/2F3dv9gdXL/YHJu/19vav9fbGb/X2li/19nXv9fZlv/YGVZ/2FkWP9iZFf/Y2RY/2NlWf9kZlv/ZGdd/2RpYP9kamP/ZGxl/2NtaP9ibmr/YW9s/2Bwbv9ecXD/XnFx/11xcv9ccnL/AGeChP9ngoP/ZoGC/2V/gP9kfX3/Y3t6/2J4dv9hdXL/YHFt/2BuaP9fa2T/X2lg/2BnXP9gZlr/YWVY/2JlV/9jZVf/ZWZY/2ZnWv9maVz/Z2pf/2dsYv9nbWX/Zm5n/2Vwav9kcGz/YnFu/2Fyb/9gcnH/XnJy/11zcv9dc3P/AGiDhP9ogoT/Z4GC/2aAgP9lfX3/ZHt5/2N4df9hdHD/YHFr/2BuZ/9fa2L/YGhe/2BmWv9hZVj/YmVW/2NlVv9lZlf/ZmdY/2dpW/9oa13/aWxg/2luY/9pcGb/aHFp/2dya/9lcm3/ZHNv/2JzcP9gc3H/X3Ny/15zcv9dc3P/AGiDhP9og4P/aIKC/2eAgP9lfXz/ZHp4/2N3dP9hc2//YHBq/2BsZP9famD/X2db/2BlWP9hZVb/Y2VU/2RlVf9mZ1b/Z2hY/2lqW/9qbF7/am5h/2pwZP9qcWf/aXJq/2hzbP9mdG7/ZHRv/2J0cP9gdHH/X3Ry/11zcv9dc3L/AGiDg/9ogoL/aIGB/2d/fv9lfXv/ZHp3/2J2cv9hcm3/YG9o/19rYv9faF3/X2ZZ/2BlVv9hZFT/YmRT/2RlU/9mZ1X/aGlY/2lrW/9qbV7/a29h/2txZf9rcmj/anNq/2h0bP9ndG7/ZXRv/2J0cP9gdHH/XnRx/11zcf9cc3H/AGiCgv9ngYH/Z4CA/2Z+ff9kfHr/Y3l1/2F1cP9gcWv/X25m/15qYP9eZ1v/XmVX/19kVP9gY1L/YmRR/2RlUv9mZ1T/aGlX/2lrWv9qbV7/a29h/2txZf9rc2j/anRq/2h0bP9mdW7/ZHRv/2J0cP9gdHD/XnNw/1xzcf9bcnH/AGaBgP9mgH//Zn9+/2V9e/9jenj/Ynd0/2B0b/9fcGn/Xmxk/11pX/9dZlr/XWRW/15jUv9fYlH/YWNQ/2NkUf9lZlT/Z2hX/2hrWv9pbV3/am9h/2pxZP9qcmf/aXNq/2d0a/9ldG3/Y3Ru/2F0b/9ec2//XHNw/1tycP9acnD/AGV/fv9kfn3/ZH18/2N7ef9heXb/YHZy/15ybf9db2j/XGtj/1toXv9bZVn/XGNV/1xiUv9eYlD/YGJQ/2FkUf9jZVP/ZWhW/2dqWf9obF3/aG5g/2lwY/9ocWb/Z3Jp/2Zza/9kc2z/YnNt/19zbv9dcm7/W3Jv/1lxb/9YcW//AGJ9e/9ifHv/YXt5/2B5d/9fd3T/XnRw/1xxbP9bbmf/Wmpi/1pnXf9ZZVn/WmNV/1tiUv9cYVH/XmJQ/19jUf9hZVP/Y2ZW/2RpWf9la1z/Zm1f/2ZuYv9mcGX/ZXFn/2Nxaf9icmv/X3Js/11xbf9bcW3/WXFu/1hwbv9XcG7/AF96ef9fenj/X3l3/153df9ddXL/W3Nv/1pwa/9ZbWb/WGpi/1hnXf9YZVn/WGNW/1liU/9aYVL/W2FR/11iUv9fY1P/YGVV/2JnWP9jaVv/Y2te/2NsYf9jbmP/Ym9m/2FvaP9fcGn/XXBr/1twbP9ZcGz/V3Bt/1Zvbf9Vb23/AFx4dv9cd3b/XHd1/1t1c/9ac3D/WXFt/1hvav9XbGb/Vmli/1ZnXv9WZVv/VmNX/1diVf9YYVP/WWFT/1phU/9cYlT/XWRV/15lWP9fZ1r/X2hd/2BqX/9fa2L/Xmxk/11tZv9cbWj/Wm5p/1huav9Xbmv/VW5s/1Rubf9Tbm3/AFl1c/9ZdXP/WHRy/1hzcf9Xcm//VnBs/1Vuaf9Va2b/VGlj/1RnX/9UZVz/VGNZ/1ViV/9VYVX/VmFU/1hhVP9ZYVT/WmJW/1tjV/9bZFn/W2Vb/1tnXv9baGD/W2li/1pqZP9Ya2b/V2xo/1Zsaf9UbWv/U21r/1JtbP9Rbmz/AFVzcf9VcnH/VXJw/1Vxb/9UcG3/VG5r/1Ntaf9Sa2b/Umlk/1JnYf9SZl7/UmRc/1NjWf9TYlf/VGFW/1VgVf9VYFX/VmBW/1dhV/9XYlj/V2Na/1dkXP9XZV7/V2Zg/1ZnY/9VaWX/VGpn/1NraP9Sa2r/UWxr/1BtbP9QbWz/AFJwb/9ScG//UnBu/1Jvbf9Rbmz/UW1q/1Fsaf9Qa2f/UGll/1BoYv9QZmD/UGVe/1FjW/9RYlr/UWFY/1JgV/9SX1b/U19W/1NfVv9TX1f/U2BZ/1NhWv9TYlz/U2Nf/1JlYf9SZmP/UWhl/1BpZ/9Qamn/T2tr/09sbP9ObGz/AE9ubf9Pbm3/T25s/09ubP9PbWv/T21q/09saf9Pa2f/T2pl/09oZP9PZ2L/T2Vf/09kXf9PYlv/T2Fa/09fWP9PXlf/T11W/1BdVv9QXVb/T11X/09eWf9PX1v/T2Fd/09iYP9PZGL/TmZk/05oZ/9OaWn/Tmpq/01ra/9NbGz/AE1tbP9NbWz/TW1r/01ta/9NbGr/TWxq/01raf9Na2j/Tmpm/05pZf9OZ2P/TmZh/05kX/9OYl3/TWFb/01fWf9NXlf/TVxW/01cVv9NW1b/TFxX/0xcWP9MXVr/TF9c/0xhXv9MY2H/TGVk/0xnZv9MaGj/TGpq/0xra/9MbGz/AEtsa/9LbGv/S2xr/0xsav9MbGr/TGxp/0xraf9Na2j/TWpn/01pZf9NaGT/TWZi/01kYP9NY17/TGFc/0xfWv9MXVj/S1xX/0tbVv9LWlb/S1pW/0pbV/9KXFn/Sl5b/0pgXv9LYmD/S2Rj/0tmZv9LaGj/TGlq/0xra/9Ma2z/Y1NHIRUkM70AAAAASUVORK5CYII=";
  // source of code below https://github.com/wheany/js-png-encoder/blob/master/generatepng.js
  // const DEFLATE_METHOD = String.fromCharCode(0x78, 0x01);
  // const CRC_TABLE: number[] = [];
  // const SIGNATURE = String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10);
  // const NO_FILTER = String.fromCharCode(0);
  //
  // const makeCrcTable = () => {
  //   let c;
  //
  //   for (let n = 0; n < 256; n++) {
  //     c = n;
  //
  //     for (let k = 0; k < 8; k++) {
  //       if (c & 1) {
  //         c = 0xedb88320 ^ (c >>> 1);
  //       } else {
  //         c = c >>> 1;
  //       }
  //     }
  //
  //     CRC_TABLE[n] = c;
  //   }
  // };
  //
  // makeCrcTable();
  //
  // const inflateStore = (data: string) => {
  //   const MAX_STORE_LENGTH = 65535;
  //   let storeBuffer = "";
  //   let remaining;
  //   let blockType;
  //
  //   for (let i = 0; i < data.length; i += MAX_STORE_LENGTH) {
  //     remaining = data.length - i;
  //     blockType = "";
  //
  //     if (remaining <= MAX_STORE_LENGTH) {
  //       blockType = String.fromCharCode(0x01);
  //     } else {
  //       remaining = MAX_STORE_LENGTH;
  //       blockType = String.fromCharCode(0x00);
  //     }
  //
  //     // little-endian
  //     storeBuffer += blockType +
  //       String.fromCharCode(remaining & 0xff, (remaining & 0xff00) >>> 8);
  //     storeBuffer += String.fromCharCode(
  //       ~remaining & 0xff,
  //       (~remaining & 0xff00) >>> 8,
  //     );
  //
  //     storeBuffer += data.substring(i, i + remaining);
  //   }
  //
  //   return storeBuffer;
  // };
  //
  // const adler32 = (data: string) => {
  //   const MOD_ADLER = 65521;
  //   let a = 1;
  //   let b = 0;
  //
  //   for (let i = 0; i < data.length; i++) {
  //     a = (a + data.charCodeAt(i)) % MOD_ADLER;
  //     b = (b + a) % MOD_ADLER;
  //   }
  //
  //   return (b << 16) | a;
  // };
  //
  // const updateCrc = (crc: number, buf: string) => {
  //   let c = crc;
  //   let b: number;
  //
  //   for (let n = 0; n < buf.length; n++) {
  //     b = buf.charCodeAt(n);
  //     c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  //   }
  //
  //   return c;
  // };
  //
  // const crc = (buf: string) => updateCrc(0xffffffff, buf) ^ 0xffffffff;
  //
  // const dwordAsString = (dword: number) =>
  //   String.fromCharCode(
  //     (dword & 0xff000000) >>> 24,
  //     (dword & 0x00ff0000) >>> 16,
  //     (dword & 0x0000ff00) >>> 8,
  //     dword & 0x000000ff,
  //   );
  //
  // const createChunk = (length: number, type: string, data: string) => {
  //   const CRC = crc(type + data);
  //
  //   return dwordAsString(length) + type + data + dwordAsString(CRC);
  // };
  //
  // const IEND = createChunk(0, "IEND", "");
  //
  // const createIHDR = (width: number, height: number) => {
  //   const IHDRdata = dwordAsString(width) +
  //     dwordAsString(height) +
  //     // bit depth
  //     String.fromCharCode(8) +
  //     // color type: 6=truecolor with alpha
  //     String.fromCharCode(6) +
  //     // compression method: 0=deflate, only allowed value
  //     String.fromCharCode(0) +
  //     // filtering: 0=adaptive, only allowed value
  //     String.fromCharCode(0) +
  //     // interlacing: 0=none
  //     String.fromCharCode(0);
  //
  //   return createChunk(13, "IHDR", IHDRdata);
  // };
  //
  // const png = (width: number, height: number, rgba: Uint8ClampedArray) => {
  //   const IHDR = createIHDR(width, height);
  //   let scanlines = "";
  //
  //   for (let y = 0; y < rgba.length; y += width * 4) {
  //     scanlines += NO_FILTER;
  //
  //     for (let x = 0; x < width * 4; x++) {
  //       scanlines += String.fromCharCode(rgba[y + x] & 0xff);
  //     }
  //   }
  //
  //   const compressedScanlines = DEFLATE_METHOD +
  //     inflateStore(scanlines) +
  //     dwordAsString(adler32(scanlines));
  //   const IDAT = createChunk(
  //     compressedScanlines.length,
  //     "IDAT",
  //     compressedScanlines,
  //   );
  //
  //   return SIGNATURE + IHDR + IDAT + IEND;
  // };
  //
  // // this is a fork of https://gist.github.com/mattiaz9/53cb67040fa135cb395b1d015a200aff
  // const getPngArray = (pngString: string) => {
  //   const pngArray = new Uint8Array(pngString.length);
  //
  //   for (let i = 0; i < pngString.length; i++) {
  //     pngArray[i] = pngString.charCodeAt(i);
  //   }
  //
  //   return pngArray;
  // };
  //
  // const blurHashToDataURL = (hash: string, width = 32, height = 32) => {
  //   const rgba = decode(hash, width, height);
  //   const pngString = png(width, height, rgba);
  //   const base64 = btoa(pngString);
  //
  //   return `data:image/png;base64,${base64}`;
  // };
  //
  // return blurHashToDataURL(inputHash);
}

/**
 * Retrieve Image data from url
 */
// async function getImage(
//   url: string,
// ): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
//   const fetchResult = await fetch(url);
//   const imageBuffer = await fetchResult.arrayBuffer();
//   return sharp(imageBuffer)
//     .raw()
//     .ensureAlpha()
//     .resize(32, 32, { fit: "inside" })
//     .toBuffer({ resolveWithObject: true })
//     .then(({ data, info }) => {
//       return {
//         width: info.width,
//         height: info.height,
//         data: new Uint8ClampedArray(data),
//       };
//     });
// }

/**
 * Generate BlurHash from url
 */
// export async function blurhashEncode(url: string) {
//   const imageData = await getImage(url);
//   return encode(imageData.data, imageData.width, imageData.height, 4, 4);
// }

/**
 * decode BlurHash to image base64
 */
// const blurHashDecode = async (
//   hash,
//   width,
//   height,
//   options = { size: 16, quality: 40 },
// ) => {
//   const hashWidth = options?.size;
//   const hashHeight = Math.round(hashWidth * (height / width));
//   const pixels = decode(hash, hashWidth, hashHeight);
//   const resizedImageBuf = await sharp(Buffer.from(pixels), {
//     raw: { channels: 4, width: hashWidth, height: hashHeight },
//   })
//     .jpeg({ overshootDeringing: true, quality: options.quality })
//     .toBuffer();
//   return `data:image/jpeg;base64,${resizedImageBuf.toString("base64")}`;
// };

if (import.meta.main) {
  const result = await getBlurhashUrl("U5A1U^pIT}xaHXozVsV@4TaJVXRPwGVsR.x]");
  console.log(result);
}
