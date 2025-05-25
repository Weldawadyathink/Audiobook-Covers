import type { DBImageData } from "./db.ts";
import { getBlurhashUrl } from "./blurhash.ts";
import { promisify } from "node:util";
import getPixels from "get-pixels";
import { extractColors } from "extract-colors";

const getPixelsAsync = promisify(getPixels);

export interface ImageData {
  id: string;
  url: string;
  blurhashUrl: string;
  source: string;
  jpeg: {
    320: string;
    640: string;
    1280: string;
  };
  webp: {
    320: string;
    640: string;
    1280: string;
  };
  primaryColor: Awaited<ReturnType<typeof extractColors>>[number];
}

const imageUrlPrefix =
  "https://audiobookcovers.global.ssl.fastly.net/file/com-audiobookcovers";

async function getPrimaryImageColor(blurhashUrl: string) {
  const pixels = await getPixelsAsync(blurhashUrl);
  const data = [...pixels.data];
  const [width, height] = pixels.shape;
  const colors = await extractColors({ data, width, height });
  return colors[0];
}

export async function shapeImageData(
  data: DBImageData[],
): Promise<ImageData[]> {
  // Converts database format to frontend compatible format
  // TODO: Add avif format
  return await Promise.all(data.map(async (image) => {
    const blurhashUrl = getBlurhashUrl(image.blurhash);
    const primaryColor = await getPrimaryImageColor(blurhashUrl);
    return {
      id: image.id,
      blurhashUrl: blurhashUrl,
      source: image.source,
      url: `${imageUrlPrefix}/original/${image.id}.${image.extension}`,
      jpeg: {
        320: `${imageUrlPrefix}/jpeg/320/${image.id}.jpg`,
        640: `${imageUrlPrefix}/jpeg/640/${image.id}.jpg`,
        1280: `${imageUrlPrefix}/jpeg/1280/${image.id}.jpg`,
      },
      webp: {
        320: `${imageUrlPrefix}/webp/320/${image.id}.webp`,
        640: `${imageUrlPrefix}/webp/640/${image.id}.webp`,
        1280: `${imageUrlPrefix}/webp/1280/${image.id}.webp`,
      },
      primaryColor: primaryColor,
    };
  }));
}

if (import.meta.main) {
  const url =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAQK0lEQVR4AQEgEN/vAP9tAP//bQD//20A//9tAP//bAD//2wA//9sAP//awD//2sC//9qA///aQT//2gG//9nB///Zgj//2QI//9iCf//YAn//14J//9cCP//WQj//1YH//9TBv//UAT//00D//9JAv//RgD//0MA//9AAP//PgD//jwA//06AP/8OQD/AP9uAP//bgD//20A//9tAP//bQD//20A//9sAP//bAD//2sC//9rA///agT//2kF//9oBv//Zgf//2UI//9jCf//YQn//18J//9cCP//Wgj//1cH//9UBv//UQX//04E//9LAv//RwH//0QA//9BAP//PwD//j0A//w7AP/7OgD/AP9wAP//cAD//3AA//9vAP//bwD//28A//9uAP//bgH//20C//9sA///awT//2oF//9pBv//aAf//2YI//9lCP//Ywn//2EJ//9fCf//XAn//1oI//9XB///VAb//1EF//9OBP//SwL//0gB//9FAP/+QgD//EAA//s/AP/6PgD/AP9zAP//cwD//3MA//9zAP//cgD//3IB//9xAf//cQH//3AC//9vAv//bgP//20E//9sBf//awb//2kH//9oCP//Zgn//2QJ//9iCv//YAr//10K//9bCf//WAn//1UI//9SBv//TwX//00D//5KAv/8RwH/+kUA//hEAP/3QwD/AP94BP//eAT//3gE//93BP//dwP//3YD//91Av//dAL//3MC//9yAv//cQL//3AD//9vBP//bgX//20G//9rCP//agn//2gK//9nC///ZQz//2IM//9gDP//Xgz//1sL//9YCv/+VQj//FMH//pQBf/4TQT/9ksC//VKAf/0SQH/AP99Cv//fQn//30J//98CP//fAf//3sG//96BP//eQP//3gC//93Av//dQL//3QC//9zA///cgT//3EG//9wCP//bwn//20L//9sDf//ag7//2gP//9mD///ZA///WEO//xeDf/6XAz/+FkK//ZWCf/0VAf/8lIF//FQBP/wTwT/AP+DD///gw7//4IO//+CDf//gQv//4AJ//9/B///fgX//30E//17Av/8egL/+3kC//p4A//6dwT/+nYG//p1CP/6dAv/+nMN//txD//7cBD/+m4R//psEv/5ahL/+GcR//ZlEf/0YhD/8l8O//FdDf/vWgv/7VgJ/+xXCP/rVgf/AP+JE///iRP//4gS//+IEf//hw///4YN//2ECv/7gwj/+YIG//eBBP/2fwP/9X4D//R9BP/0fAX/9HsH//R6Cv/0eQz/9HgP//R3Ef/0dRL/9HQU//RyFP/zcBX/8m0U//BrFP/vaBP/7WUR/+tjEP/qYA7/6F4N/+ddC//mXAr/AP6PF//+jxf//o4W//yOFf/7jRP/+YsR//eKDv/1iQz/84cJ//KGB//whQX/74QF/+6CBv/ugQf/7oAJ/+6ADP/ufw7/7n0R/+58E//uexX/7nkW/+53F//tdRf/7HMX/+twFv/pbhb/52sU/+ZoE//kZhH/42QQ/+JiD//hYQ7/APqUGv/6lBr/+ZQZ//iTGP/2khb/9JEU//KQEv/wjg//7o0N/+2MC//rign/6okI/+mICf/ohwr/6IYM/+iFD//ohBH/6IMT/+iBFf/pgBf/6H4Y/+h8Gf/nehn/5ngZ/+V1Gf/kchj/4m8X/+FtFf/fahT/3mgT/91mEf/dZRH/APaaHf/2mh3/9Zkc//SYG//ymBn/8JYY/+6VFf/slBP/6pMR/+mRD//nkA7/5o8N/+WNDf/kjA7/5IsQ/+OKEv/kiRT/5IgW/+SGGP/khRn/5IMa/+OBG//jfhv/4nwb/+F5G//fdhr/3nMZ/9xwF//bbhb/2mwV/9lqFP/YaRP/APOeH//znh//8p4f//GdHv/vnBz/7pwb/+yaGf/pmRf/55gV/+aXFP/klRL/45QS/+GTEv/hkRP/4JAU/+CPFf/gjhf/4IwZ/+CKGv/giBv/4IYc/+CEHf/fgR3/3n8d/918HP/beRv/2nYa/9hzGf/XcBj/1m4W/9VsFf/UaxX/APGiIf/xoiH/8KIh/++iIP/uoR//7KAd/+qfHP/onhr/5p0Z/+ScGP/imhf/4ZkX/+CYF//flhf/35UY/96TGf/ekhr/3pAb/96OHP/ejB3/3oke/92GHv/dhB7/24Ee/9p9Hf/Zehz/13cb/9V0Gv/Uchn/0m8Y/9FuF//RbRb/APGmI//xpiP/8KUi/++lIv/tpSH/7KQg/+qjH//ooh7/5aEd/+SgHP/inxv/4Z0b/9+cG//fmhv/3pkc/96XHP/elR3/3pMe/96QHv/ejh//3Ysf/9yIH//bhR//2oIf/9l+Hv/Xex3/1Xgc/9N1G//Rchr/0HAZ/89uGP/ObRf/APKoJP/yqCT/8agj//CoI//upyL/7Kci/+qmIf/opiH/5qUg/+SkH//jox//4aEf/+CgH//gnh//35wf/9+aIP/fmCD/35Ug/9+SIP/ejyD/3owg/92JIP/bhSD/2oIf/9h+Hv/Weh3/1Hcc/9J0G//QcRr/zm8Z/81tGf/MbBj/APOqJP/zqiT/8qok//GqJP/wqST/7qkj/+ypI//qqCP/6Kgj/+anI//lpiP/46Qi/+KjIv/ioSL/4Z8i/+GcIv/hmSL/4JYi/+CTIv/gkCH/34wh/96IIP/chCD/2oAf/9h8Hv/WeR3/1HUc/9FyG//Pbxr/zWwZ/8xrGf/Lahj/AParJP/1qyT/9ask//SrJP/yqyX/8Kol/+6qJf/sqiX/6qkl/+mpJf/nqCX/5qYl/+WlJf/koyX/5KAl/+OdJf/jmiT/45ck/+KTI//ijyL/4Ysh/9+HIP/egx//3H4e/9l6Hf/Xdhz/1HIb/9FvGv/PbBr/zGkZ/8toGP/KZhj/APiqJP/4qiT/96ok//arJP/1qyX/86sl//GrJv/vqyf/7aon/+uqJ//qqSj/6aco/+imKP/noyf/56En/+aeJv/mmib/5pcl/+WSJP/kjiP/44kh/+GFIP/fgB//3Xse/9p3HP/Xchv/1G4a/9FrGf/OaBn/zGUY/8pjGP/JYhj/APqpI//6qSP/+akj//iqJP/3qiX/9aom//OqJv/yqif/8Koo/+6qKf/tqSn/66cp/+qmKf/qoyn/6aAo/+mdKP/omSf/6JUl/+eRJP/mjCL/5Ych/+OCH//hfB7/3ncc/9tyG//Ybhr/1WkZ/9FmGP/OYhf/zGAX/8peF//IXRb/APynIf/8pyH/+6ci//qoI//5qCT/96kl//apJv/0qSj/8qkp//CpKv/vqCr/7qYq/+2kKv/soir/658p/+ubKP/rlyf/6pMl/+mOJP/oiSL/5oMg/+R9Hv/ieBz/33Ib/9xtGf/YaBj/1WQX/9FgFv/OXBb/y1oV/8lYFf/IVhX/AP6kH//+pB///aQg//ylIf/6pSP/+aYk//emJv/1pyf/86co//KmKv/wpir/76Qr/+6iK//toCr/7Zwp/+yZKP/slCf/648l/+qKI//phSH/538f/+V5Hf/icxr/320Z/9xnF//YYhb/1V0U/9FZFP/NVRP/ylIT/8hQE//HTxP/AP6gHf/+oB3//aAe//yhH//7oiH/+aIj//ijJP/2oyb/9KMo//KjKf/xoir/8KEq/++fKv/unCr/7Zkp/+2VJ//skCb/64sk/+qGIv/pgB//53kd/+VzG//ibRj/32YW/9tgFP/XWxP/1FYS/9BREf/MTRD/yUoQ/8dIEP/FRxD/AP6bGf/+mxr//Zwb//ycHP/7nR7/+Z4g//eeIv/2nyT/9J8m//KeJ//xnij/75wp/+6aKf/ulyj/7ZQn/+yQJv/riyT/6oYi/+mAIP/oeh3/5nQb/+NtGP/hZhX/3WAT/9pZEf/WUw//0k4O/85JDf/KRA3/x0EN/8U/Df/DPQ3/AP2WFf/9lhb//JYX//uXGf/6lxv/+Jgd//aZH//0mSH/85kj//GZJf/vmCb/7pcm/+2UJv/skib/644l/+qKJP/phSL/6IAg/+d6Hv/ldBv/420Y/+FmFf/eXxL/21gQ/9dRDf/TSwv/z0UK/8s/Cf/IOwn/xTcI/8M0CP/BMgj/APuQEf/6kBH/+pAT//mRFP/4kRf/9pIZ//SSHP/ykx7/8ZMg/++SIf/tkSL/7JAj/+uOI//piyP/6Igi/+eDIf/mfx//5Xkd/+RzGv/ibRj/4GYV/91fEv/bWA//11EM/9RJCf/QQgf/zDwF/8g1BP/FMAT/wisE/8AnBP++JQT/APiJC//4iQv/94kN//aKD//1ixL/84sV//GLF//wjBr/7owc/+yLHf/qih7/6Ykf/+eGH//mhB//5YAe/+R8Hf/jdxv/4XIZ/+BsF//eZhT/3F8R/9lYDv/WUAr/00gH/9BBBP/MOQL/yDEB/8UqAP/BIwD/vhwA/7wXAP+7EwD/APWCBP/0gwT/9IMG//ODCP/xhAv/8IQP/+6EEf/shBT/6oQW/+iDGP/nghn/5YEa/+N+Gv/ifBr/4Xga/990GP/ebxf/3WoV/9tkEv/ZXhD/11cM/9RQCf/RSAX/zkAD/8s4AP/HLwD/xCYA/8AdAP+9EgD/uwQA/7kAAP+3AAD/APF8AP/xfAD/8HwA/+98Af/ufQT/7H0H/+p9Cv/pfQ3/53wQ/+V7Ev/jehP/4XgU/992Ff/ecxX/3HAU/9tsE//ZZxL/2GIQ/9ZcDf/UVgr/0k8H/89IBP/MQAH/yTgA/8YvAP/DJQD/vxkA/7wIAP+5AAD/twAA/7UAAP+0AAD/AO12AP/tdgD/7XYA/+x2AP/qdgD/6XYA/+d2Av/ldQT/43QH/+FzCv/fcgv/3XAN/9tuDf/Zaw7/2GgN/9ZkDP/UXwv/01sJ/9FVB//PTwX/zEgC/8pBAP/HOQD/xDAA/8EmAP++GQD/uwYA/7gAAP+1AAD/swAA/7EAAP+wAAD/AOpwAP/qcAD/6XAA/+hwAP/ncAD/5nAA/+RvAP/ibwD/4G4A/91sAf/bawP/2WkE/9dnBf/VZAb/1GAG/9JdBf/QWAT/zlQD/8xOAv/KSAD/yEIA/8U6AP/DMgD/wCgA/70dAP+6CwD/twAA/7QAAP+yAAD/sAAA/64AAP+tAAD/AOhsAP/nbAD/52wA/+ZsAP/lawD/42sA/+FqAP/faQD/3WgA/9tnAP/ZZQD/1mMA/9RgAP/SXgD/0FoA/85XAP/MUwD/yk4A/8hJAP/GQwD/xDwA/8I1AP+/LAD/vCIA/7oUAP+3AAD/tAAA/7EAAP+vAAD/rQAA/6wAAP+rAAD/AOZpAP/maQD/5WkA/+RpAP/jaAD/4WgA/99nAP/dZgD/22QA/9ljAP/XYQD/1V8A/9JcAP/QWgD/zlYA/8xTAP/KTwD/yEoA/8ZFAP/EPwD/wjkA/78xAP+9KAD/uh0A/7cNAP+1AAD/sgAA/7AAAP+tAAD/rAAA/6oAAP+pAAD/nPWqtmqHJmcAAAAASUVORK5CYII=";
  const color = await getPrimaryImageColor(url);
  console.log(color);
}
