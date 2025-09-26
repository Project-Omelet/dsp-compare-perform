const fs = require("fs");
const { WASI } = require("wasi");

const numSettingValueItems = 38;

const MAXIMUM_CHANNELS = 5;
const MAXIMUM_TEMPERATURES = 3;
const MAXIMUM_CYCLES = 50;

const pointers = {
  inputPointer: {},
  dspPointer: {},
  dspBaseSubstPointer: {},
};

let Module = null;
let heapF64 = null;
let heapU32 = null;

const loadLib = async () => {
  const wasmBuffer = fs.readFileSync("lib/optimized-nonglue/dsp_v2_x.wasm");
  // const memory = new WebAssembly.Memory({ initial: 256, maximum: 65536 });
  const wasi = new WASI({
    version: "preview1",
  });
  const importObject = {
    env: {
      // memory,
      emscripten_notify_memory_growth: () => {
        updateMemoryViews();
      },
      __cxa_throw: (ptr, type, destructor) => {
        throw new Error(
          `[Wasm C++ Exception] ptr: ${ptr} type: ${type} destructor: ${destructor}`
        );
      },
      __cxa_begin_catch: (ptr) => {
        return ptr;
      },
      __cxa_end_catch: () => {},
      _abort_js: () => {},

      emscripten_resize_heap: (size) => {
        return true; // 메모리 확장을 지원하지 않을 경우 false 반환
      },
      _tzset_js: () => {},
    },
    wasi_snapshot_preview1: wasi.wasiImport,
  };

  const wasmModule = await WebAssembly.instantiate(wasmBuffer, importObject);
  const instance = wasmModule.instance;
  const exports = instance.exports;

  // if (instance.exports._start) {
  //   exports._start();
  // } else if (instance.exports.__wasi_proc_exit) {
  //   wasi.start(instance);
  // }

  wasi.initialize(instance);

  if (exports.__wasm_call_ctors) {
    exports.__wasm_call_ctors();
  }

  return instance.exports;
};

function updateMemoryViews() {
  const memoryBuffer = Module.memory.buffer;
  heapF64 = new Float64Array(memoryBuffer);
  heapU32 = new Uint32Array(memoryBuffer);
}

const dspMemAlloc = () => {
  // 데이터 타입별 바이트 크기를 상수로 정의합니다.
  const dataTypes = {
    F64: 8,
    I32: 4,
  };

  // 공통적으로 사용되는 사이즈 계산식을 상수로 만들어 가독성을 높입니다.
  const size = {
    CH_X_TEMP: MAXIMUM_CHANNELS * MAXIMUM_TEMPERATURES,
    CY_X_CH: MAXIMUM_CYCLES * MAXIMUM_CHANNELS,
    CY_X_CH_X_TEMP: MAXIMUM_CYCLES * MAXIMUM_CHANNELS * MAXIMUM_TEMPERATURES,
  };

  // 각 객체에 할당할 포인터 정보를 배열로 정의합니다.
  // [포인터 이름, 크기 계산식, 데이터 타입]
  const allocations = {
    inputPointer: [
      ["rawDataLowPtr", size.CY_X_CH, "F64"],
      ["rawDataMidPtr", size.CY_X_CH, "F64"],
      ["rawDataHighPtr", size.CY_X_CH, "F64"],
    ],
    dspPointer: [
      ["analysisCtResultPtr", size.CH_X_TEMP, "F64"],
      ["finalCtResultPtr", size.CH_X_TEMP, "F64"],
      ["finalResultWellPtr", size.CH_X_TEMP, "I32"],
      ["finalDataProcessNumPtr", size.CH_X_TEMP, "I32"],
      ["endRfuPtr", size.CH_X_TEMP, "F64"],
      ["dfPtr", size.CH_X_TEMP, "F64"],
      ["shtPtr", size.CH_X_TEMP, "F64"],
      ["sht2Ptr", size.CH_X_TEMP, "F64"],
      ["lsrValPtr", size.CH_X_TEMP, "F64"],
      ["rdDiffDataPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["origRfuPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["preprocRfuPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["ivdCddPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["cffPtr", 2 * size.CH_X_TEMP, "F64"],
      ["scdFitPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["r2Ptr", size.CH_X_TEMP, "F64"],
      ["rp2Ptr", size.CH_X_TEMP, "F64"],
      ["efcPtr", size.CH_X_TEMP, "I32"],
      ["absdOrigDataPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["absdDataPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["fDataPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["fNewDataPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["paramPtr", 4 * size.CH_X_TEMP, "F64"],
      ["paramNewPtr", 4 * size.CH_X_TEMP, "F64"],
      ["thrdPtr", size.CH_X_TEMP, "F64"],
      ["normalizationResultPtr", size.CY_X_CH_X_TEMP, "F64"],
    ],
    dspBaseSubstPointer: [
      ["origRfuPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["preprocRfuPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["rdDiffDataPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["scdFitPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["rp2Ptr", size.CH_X_TEMP, "F64"],
      ["efcPtr", size.CH_X_TEMP, "I32"],
      ["thrdPtr", size.CH_X_TEMP, "F64"],
      ["finalResultWellPtr", size.CH_X_TEMP, "I32"],
      ["finalDataProcessNumPtr", size.CH_X_TEMP, "I32"],
      ["lsrValPtr", size.CH_X_TEMP, "F64"],
      ["endRfuPtr", size.CH_X_TEMP, "F64"],
      ["absdOrigDataPtr", size.CY_X_CH_X_TEMP, "F64"],
      ["absdDataPtr", size.CY_X_CH_X_TEMP, "F64"],
    ],
  };

  // 설정 객체를 순회하며 메모리를 할당하는 범용 로직
  for (const targetObjName in allocations) {
    allocations[targetObjName].forEach(([key, size, type]) => {
      pointers[targetObjName][key] = Module.malloc(size * dataTypes[type]);
    });
  }
};

const dspMemFree = () => {
  const pointerObjects = [
    pointers.inputPointer,
    pointers.dspPointer,
    pointers.dspBaseSubstPointer,
  ];

  pointerObjects.forEach((obj) => {
    for (const key in obj) {
      if (obj[key]) {
        Module.free(obj[key]);
      }
    }
  });
};

async function init() {
  Module = await loadLib();
  updateMemoryViews();
}

async function terminate() {
  // Terminate logic
}

async function getVersion() {
  return "v2.2.1-beta.1";
}

const setRfuData = (rawDataLow, rawDataHigh) => {
  const bytesPerElementF64 = 8;

  const operations = [
    [rawDataLow, "rawDataLowPtr"],
    [rawDataHigh, "rawDataHighPtr"],
  ];

  for (const [sourceArray, pointerKey] of operations) {
    const destinationPointer = pointers.inputPointer[pointerKey];

    if (sourceArray && destinationPointer) {
      const offset = destinationPointer / bytesPerElementF64;
      heapF64.set(sourceArray, offset);
    }
  }
};

const getMem = (numCycles, numTempers, numChannels) => {
  const memoryBuffer = Module.memory.buffer;
  const dataTypes = {
    F64: Float64Array,
    I32: Int32Array,
  };

  const sizeTC = numTempers * numChannels;
  const sizeTCC = numTempers * numChannels * numCycles;

  // [결과 키, 포인터 키, 데이터 타입, 사이즈]
  const memConfig = [
    // dspPointer
    ["analysisCtResult", "analysisCtResultPtr", "F64", sizeTC],
    ["finalCtResult", "finalCtResultPtr", "F64", sizeTC],
    ["finalResultWell", "finalResultWellPtr", "I32", sizeTC],
    ["finalDataprocessNum", "finalDataProcessNumPtr", "I32", sizeTC],
    ["endRFU", "endRfuPtr", "F64", sizeTC],
    ["df", "dfPtr", "F64", sizeTC],
    ["sht", "shtPtr", "F64", sizeTC],
    ["sht2", "sht2Ptr", "F64", sizeTC],
    ["lsrVal", "lsrValPtr", "F64", sizeTC],
    ["rdDiffData", "rdDiffDataPtr", "F64", sizeTCC],
    ["origRfu", "origRfuPtr", "F64", sizeTCC],
    ["preprocRfu", "preprocRfuPtr", "F64", sizeTCC],
    ["ivdCdd", "ivdCddPtr", "F64", sizeTCC],
    ["cff", "cffPtr", "F64", sizeTC * 2],
    ["scdFit", "scdFitPtr", "F64", sizeTCC],
    ["r2", "r2Ptr", "F64", sizeTC],
    ["rp2", "rp2Ptr", "F64", sizeTC],
    ["efc", "efcPtr", "I32", sizeTC],
    ["absdOrigData", "absdOrigDataPtr", "F64", sizeTCC],
    ["absdData", "absdDataPtr", "F64", sizeTCC],
    ["fData", "fDataPtr", "F64", sizeTCC],
    ["fNewData", "fNewDataPtr", "F64", sizeTCC],
    ["param", "paramPtr", "F64", sizeTC * 4],
    ["paramNew", "paramNewPtr", "F64", sizeTC * 4],
    ["thrd", "thrdPtr", "F64", sizeTC],
    ["normalizationResult", "normalizationResultPtr", "F64", sizeTCC],

    // dspBaseSubstPointer
    ["basesubstOrigRfu", "origRfuPtr", "F64", sizeTCC, "base"],
    ["basesubstPreprocRfu", "preprocRfuPtr", "F64", sizeTCC, "base"],
    ["basesubstRdDiffData", "rdDiffDataPtr", "F64", sizeTCC, "base"],
    ["basesubstScdFit", "scdFitPtr", "F64", sizeTCC, "base"],
    ["basesubstRp2", "rp2Ptr", "F64", sizeTC, "base"],
    ["basesubstEfc", "efcPtr", "I32", sizeTC, "base"],
    ["basesubstThrd", "thrdPtr", "F64", sizeTC, "base"],
    ["basesubstFinalResultWell", "finalResultWellPtr", "I32", sizeTC, "base"],
    [
      "basesubstFinalDataprocessNum",
      "finalDataProcessNumPtr",
      "I32",
      sizeTC,
      "base",
    ],
    ["basesubstLsrVal", "lsrValPtr", "F64", sizeTC, "base"],
    ["basesubstEndRFU", "endRfuPtr", "F64", sizeTC, "base"],
    ["basesubstAbsdOrig", "absdOrigDataPtr", "F64", sizeTCC, "base"],
    ["basesubstAbsd", "absdDataPtr", "F64", sizeTCC, "base"],
  ];

  const result = {};

  for (const [resultKey, ptrKey, type, size, pointerGroup] of memConfig) {
    const Ctor = dataTypes[type];
    const sourcePointerObj =
      pointerGroup === "base"
        ? pointers.dspBaseSubstPointer
        : pointers.dspPointer;

    const pointer = sourcePointerObj[ptrKey];
    if (pointer) {
      result[resultKey] = new Ctor(memoryBuffer, pointer, size).slice();
    }
  }

  return result;
};

/**
 * Low/High 값 쌍을 가져오는 헬퍼 함수입니다.
 * Step이 하나일 경우 Low 값을 High 값으로 자동 복사합니다.
 * @param {Array} steps - algorithmSettings의 Step 배열
 * @param {Function} valueExtractor - 각 step 객체에서 원하는 값을 추출하는 함수
 * @returns {[number, number]} [lowValue, highValue] 쌍
 */
const getValuePair = (steps, valueExtractor) => {
  const lowValue = valueExtractor(steps[0]);
  const highValue = steps.length === 2 ? valueExtractor(steps[1]) : lowValue;
  return [lowValue, highValue];
};

/**
 * 단일 채널에 대한 설정 배열을 생성합니다.
 * @param {object} settings - 특정 채널의 algorithmSettings
 * @param {object} temp - 특정 채널의 usedTemp
 * @param {number} ispc - ispc 값
 * @returns {Array<number>} 해당 채널의 모든 설정 값이 담긴 배열
 */
const createChannelSettings = (settings, temp, ispc) => {
  const { Step, MuDT } = settings;
  const stepLength = Step.length;
  const step1 = Step[0]; // 편의를 위해 Step[0]을 변수로 추출

  // BPN
  const bpnSettings = () => {
    if (step1.BPN.RV === 0) {
      return [0, 0, 0, 0, 0]; // Switch off
    }
    const [rvLow, rvHigh] = getValuePair(Step, (s) => s.BPN.RV);
    return [1, step1.BPN.StartCycle, step1.BPN.EndCycle, rvLow, rvHigh]; // Switch on
  };

  return [
    temp.low,
    temp.high,
    step1.DSP.SFC,
    step1.DSP.MFC,
    ...bpnSettings(),
    stepLength === 2 ? MuDT.CR : 0,
    ...getValuePair(Step, (s) => s.PostProcess.CtCutoff),
    ...getValuePair(Step, (s) => s.DSP.PMC),
    ...getValuePair(Step, (s) => s.DSP.dRFU),
    ...getValuePair(Step, (s) => s.DSP.Threshold),
    ...getValuePair(Step, (s) => s.DSP.RparSquare),
    ...getValuePair(Step, (s) => s.DSP.RSquare),
    ...getValuePair(Step, (s) => s.DSP.dfM),
    ...getValuePair(Step, (s) => s.DSP.dfC),
    step1.PostProcess.dRFU2 ?? 0,
    step1.PostProcess.dRFU3 ?? 0,
    ispc,
    ...getValuePair(Step, (s) => s.DSP.isMultiAmp),
    step1.DSP.fb,
    1, // AR LOW
    1, // AR HIGH
    step1.DSP.DataScale, // Data scale LOW
    step1.DSP.DataScale, // Data scale HIGH
    step1.DSP.EarlyAmpCriteria, // EAT LOW
    step1.DSP.EarlyAmpCriteria, // EAT HIGH
  ];
};

/**
 * 최종 설정 배열을 생성하는 메인 함수
 */
const makeSettings = (algorithmSettings, usedTemp, numChannels, ispc) => {
  const settingsArr = [];
  let settingsIndex = 0;

  for (let channelIndex = 0; channelIndex < numChannels; channelIndex++) {
    const currentSettings = algorithmSettings[settingsIndex];

    // Optional Chaining(?.)을 사용해 currentSettings가 없을 때 에러를 방지합니다.
    if (currentSettings?.channel === channelIndex + 1) {
      // ✅ 복잡한 로직을 `createChannelSettings` 함수 호출로 대체
      const channelValues = createChannelSettings(
        currentSettings,
        usedTemp[channelIndex],
        ispc
      );
      settingsArr.push(...channelValues);
      settingsIndex++;
    } else {
      // 사용하지 않는 채널은 0으로 채웁니다.
      // 참고: numSettingValueItems는 기존 코드에 있던 변수로 가정합니다.
      settingsArr.push(...new Array(numSettingValueItems).fill(0));
    }
  }
  return settingsArr;
};

const SettingsLayout = {
  // --- Member Offsets (in bytes) ---
  USED_TEMP_OFFSET: 0, // double[2] = 16 bytes
  SFC_OFFSET: 16,
  MFC_OFFSET: 24,
  BPN_SWITCH_OFFSET: 32,
  BPN_START_CYCLE_OFFSET: 40,
  BPN_END_CYCLE_OFFSET: 48,
  BPN_RV_OFFSET: 56, // double[2] = 16 bytes
  CR_OFFSET: 72,
  CT_CUT_OFF_OFFSET: 80, // double[2] = 16 bytes
  PMC_OFFSET: 96, // double[2] = 16 bytes
  DRFU_OFFSET: 112, // double[2] = 16 bytes
  THRD_OFFSET: 128, // double[2] = 16 bytes
  RPC_OFFSET: 144, // double[2] = 16 bytes
  RC_OFFSET: 160, // double[2] = 16 bytes
  DFM_OFFSET: 176, // double[2] = 16 bytes
  DFC_OFFSET: 192, // double[2] = 16 bytes
  DRFU2_OFFSET: 208,
  DRFU3_OFFSET: 216,
  ISPC_OFFSET: 224,
  IS_MULTIAMP_OFFSET: 232, // double[2] = 16 bytes
  FB_OFFSET: 248,
  AR_OFFSET: 256, // double[2] = 16 bytes
  DATA_SCALE_OFFSET: 272, // double[2] = 16 bytes
  QUICKAMP_CRITERION_OFFSET: 288, // double[2] = 16 bytes
  // --- Total Size (in bytes) ---
  STRUCT_SIZE: 304, // 구조체 하나의 전체 크기
};

/**
 * 알고리즘 설정 데이터를 WASM 메모리 버퍼로 변환하고 포인터를 반환
 * @param {Array} algorithmSettings - 'SAMPLE' 또는 'PC' 등으로 필터링된 설정 배열
 * @param {Array} usedTemp - 온도 정보 배열
 * @param {number} numChannels - 전체 채널 수
 * @param {number} ispc - ispc 값 (0 또는 1)
 * @returns {number} WASM 메모리에 생성된 버퍼의 포인터
 */
const createSettingsBuffer = (
  algorithmSettings,
  usedTemp,
  numChannels,
  ispc
) => {
  if (numChannels === 0) return 0; // 채널이 없으면 null 포인터 반환

  const totalBytes = numChannels * SettingsLayout.STRUCT_SIZE;
  const bufferPtr = Module.malloc(totalBytes);

  // (makeSettings는 createChannelSettings 헬퍼 함수를 내부적으로 사용)
  const flatSettingsArray = makeSettings(
    algorithmSettings,
    usedTemp,
    numChannels,
    ispc
  );

  const valuesPerChannel = flatSettingsArray.length / numChannels; // 채널당 값의 개수

  for (let chidx = 0; chidx < numChannels; chidx++) {
    // 현재 채널의 구조체가 시작될 메모리 주소
    const structBasePtr = bufferPtr + chidx * SettingsLayout.STRUCT_SIZE;

    // 현재 채널의 데이터가 시작될 배열 인덱스
    const arrayBaseIndex = chidx * valuesPerChannel;

    // HEAP View의 인덱스 = 바이트 주소 / 8
    const heapIndex = structBasePtr / 8;

    // 배열의 값을 순서대로 WASM 메모리에 복사
    for (let i = 0; i < valuesPerChannel; i++) {
      heapF64[heapIndex + i] = flatSettingsArray[arrayBaseIndex + i];
    }
  }

  return bufferPtr;
};

/** AnlssRsltFinal 객체 생성 */
const createAnalysisResult = (dspResults, i, wellId, numCycles) => {
  const slice = (arr, size) => arr.slice(i * size, i * size + size);
  return {
    well: wellId,
    rdngrslt: dspResults.finalResultWell[i],
    negCd: dspResults.finalDataprocessNum[i],
    endrfu: dspResults.endRFU[i],
    sht: dspResults.sht[i],
    lsr: dspResults.lsrVal[i],
    rd: slice(dspResults.rdDiffData, numCycles),
    mudtRd: slice(dspResults.preprocRfu, numCycles),
    ivdCdd: slice(dspResults.ivdCdd, numCycles),
    cff: slice(dspResults.cff, 2),
    scdFit: slice(dspResults.scdFit, numCycles),
    r2: dspResults.r2[i],
    rp2: dspResults.rp2[i],
    efc: dspResults.efc[i],
    aftrbslnsbtrctddtOrgnl: slice(dspResults.absdOrigData, numCycles),
    aftrbslnsbtrctddt: slice(dspResults.absdData, numCycles),
    f: slice(dspResults.fData, numCycles),
    fNew: slice(dspResults.fNewData, numCycles),
    sigCffcnt: slice(dspResults.param, 4),
    sigCffcntNew: slice(dspResults.paramNew, 4),
    df: dspResults.df[i],
    ct:
      dspResults.analysisCtResult[i] === -1
        ? null
        : dspResults.analysisCtResult[i],
    ctFinal:
      dspResults.finalCtResult[i] === -1 ? null : dspResults.finalCtResult[i],
    thrd: dspResults.thrd[i],
  };
};

/** BaselineSubstRsltFinal 객체 생성 */
const createBaselineResult = (dspResults, i, numCycles) => {
  const slice = (arr) => arr.slice(i * numCycles, i * numCycles + numCycles);
  return {
    origRfu: slice(dspResults.basesubstOrigRfu),
    preprocRfu: slice(dspResults.basesubstPreprocRfu),
    rdDiff: slice(dspResults.basesubstRdDiffData),
    scdFit: slice(dspResults.basesubstScdFit),
    absdOrig: slice(dspResults.basesubstAbsdOrig),
    absd: slice(dspResults.basesubstAbsd),
    rp2: dspResults.basesubstRp2[i],
    efc: dspResults.basesubstEfc[i],
    thrd: dspResults.basesubstThrd[i],
    rdngrslt: dspResults.basesubstFinalResultWell[i],
    negCd: dspResults.basesubstFinalDataprocessNum[i],
    lsr: dspResults.basesubstLsrVal[i],
    endRFU: dspResults.basesubstEndRFU[i],
  };
};

async function main(props) {
  // Number of channels
  const numChannels = 5;
  // Length of cycles
  const numCycles = 45;
  // Number of temperatures
  const numTempers = 2;

  // reduce를 사용해 targetTemp 객체를 usedTemp 배열로 변환
  const usedTemp = Array.from({ length: 5 }, () => ({
    low: 1,
    mid: 0,
    high: 1,
  }));

  // Setting values
  const algorithmSettings = props.settingValues;
  const sortedSettings = [...algorithmSettings].sort(
    (a, b) => a.channel - b.channel
  );

  const groupedSettings = sortedSettings.reduce(
    (groups, item) => {
      const type = item.Type;
      groups[type] = groups[type] || [];
      groups[type].push(item);
      return groups;
    },
    { SAMPLE: [], PC: [], NC: [] }
  );

  pointers.inputPointer.settingValuesPtr = createSettingsBuffer(
    groupedSettings.SAMPLE,
    usedTemp,
    numChannels,
    0
  );

  // Raw Data per well
  const rawDataLow = props.lowRfu;
  const rawDataHigh = props.highRfu;

  // Memory alloc
  dspMemAlloc();

  setRfuData(rawDataLow, rawDataHigh);

  const pointerOrder = [
    // DspOutputPointers (26개)
    pointers.dspPointer.analysisCtResultPtr,
    pointers.dspPointer.finalCtResultPtr,
    pointers.dspPointer.finalResultWellPtr,
    pointers.dspPointer.finalDataProcessNumPtr,
    pointers.dspPointer.endRfuPtr,
    pointers.dspPointer.dfPtr,
    pointers.dspPointer.shtPtr,
    pointers.dspPointer.sht2Ptr,
    pointers.dspPointer.lsrValPtr,
    pointers.dspPointer.rdDiffDataPtr,
    pointers.dspPointer.origRfuPtr,
    pointers.dspPointer.preprocRfuPtr,
    pointers.dspPointer.ivdCddPtr,
    pointers.dspPointer.cffPtr,
    pointers.dspPointer.scdFitPtr,
    pointers.dspPointer.r2Ptr,
    pointers.dspPointer.rp2Ptr,
    pointers.dspPointer.efcPtr,
    pointers.dspPointer.absdOrigDataPtr,
    pointers.dspPointer.absdDataPtr,
    pointers.dspPointer.fDataPtr,
    pointers.dspPointer.fNewDataPtr,
    pointers.dspPointer.paramPtr,
    pointers.dspPointer.paramNewPtr,
    pointers.dspPointer.thrdPtr,
    pointers.dspPointer.normalizationResultPtr,
    // BaselineSubstOutputPointers (13개)
    pointers.dspBaseSubstPointer.origRfuPtr,
    pointers.dspBaseSubstPointer.preprocRfuPtr,
    pointers.dspBaseSubstPointer.rdDiffDataPtr,
    pointers.dspBaseSubstPointer.scdFitPtr,
    pointers.dspBaseSubstPointer.rp2Ptr,
    pointers.dspBaseSubstPointer.efcPtr,
    pointers.dspBaseSubstPointer.thrdPtr,
    pointers.dspBaseSubstPointer.finalResultWellPtr,
    pointers.dspBaseSubstPointer.finalDataProcessNumPtr,
    pointers.dspBaseSubstPointer.lsrValPtr,
    pointers.dspBaseSubstPointer.endRfuPtr,
    pointers.dspBaseSubstPointer.absdOrigDataPtr,
    pointers.dspBaseSubstPointer.absdDataPtr,
  ];

  const POINTER_SIZE = 4;
  const numPointers = pointerOrder.length; // 39 대신 동적으로 계산
  const resultsStructPtr = Module.malloc(numPointers * POINTER_SIZE);

  const baseIndex = resultsStructPtr / POINTER_SIZE;
  pointerOrder.forEach((pointerValue, index) => {
    heapU32[baseIndex + index] = pointerValue;
  });

  Module.RunDsp2ctExona(
    // Input
    numChannels,
    numTempers,
    pointers.inputPointer.settingValuesPtr,
    0,
    0,
    pointers.inputPointer.rawDataLowPtr,
    pointers.inputPointer.rawDataHighPtr,
    numCycles,
    // Output
    resultsStructPtr
  );

  const algoprithmResults = getMem(numCycles, numTempers, numChannels);

  const ret = {
    dsp: [],
    baselinesub: [],
  };
  for (let chidx = 0; chidx < numChannels * 2; chidx++) {
    for (let tidx = 0; tidx < numTempers; tidx++) {
      const i = chidx + tidx;

      const dspResult = createAnalysisResult(
        algoprithmResults,
        i,
        props.wellId,
        numCycles
      );

      const baselineSubstResult = createBaselineResult(
        algoprithmResults,
        i,
        numCycles
      );

      ret.dsp.push(dspResult);
      ret.baselinesub.push(baselineSubstResult);
    }
  }

  // Memory free
  dspMemFree();

  return ret;
}

module.exports = {
  init,
  terminate,
  getVersion,
  main,
};
