const koffi = require("koffi");

/*
 * 전역 상수
 * - NUM_OF_SETTINGS: 설정 값의 개수
 * - MAXIMUM_CROSSTALK: 최대 Crosstalk 개수
 * - NUM_OF_CROSSTALK: Crosstalk 설정 값의 개수
 * - MAXIMUM_CYCLE: 최대 사이클 수
 */
const NUM_OF_SETTINGS = 38;
const MAXIMUM_CYCLE = 50;
const MAXIMUM_CHANNEL = 5;
const MAXIMUM_TEMPERATURE = 3;

let dspOutputPtr;
let basesubOutputPtr;

/**
 * 버퍼 정의 배열을 기반으로 Koffi 버퍼 객체를 생성하는 헬퍼 함수
 * @param {Array<[string, string, number]>} definitions - [속성이름, 타입, 크기] 형태의 배열
 * @returns {object} 속성 이름과 할당된 버퍼를 포함하는 객체
 */
const createBuffersFromDefs = (definitions) => {
  const pointers = {};
  for (const [prop, type, size] of definitions) {
    pointers[prop] = koffi.alloc(type, size);
  }
  return pointers;
};

const allocBuffer = () => {
  // 1. 반복되는 크기 계산을 상수로 정의
  const SIZE_CT_COMMON = MAXIMUM_CHANNEL * MAXIMUM_TEMPERATURE;
  const SIZE_FULL = MAXIMUM_CYCLE * MAXIMUM_CHANNEL * MAXIMUM_TEMPERATURE;

  // 2. 출력 버퍼 설정을 데이터로 정의
  const dspOutputBufferDefs = [
    // Analysis
    ["analysisCtResultPtr", "double", SIZE_CT_COMMON],
    ["finalCtResultPtr", "double", SIZE_CT_COMMON],
    ["finalResultWellPtr", "int", SIZE_CT_COMMON],
    ["finalDataProcessNumPtr", "int", SIZE_CT_COMMON],
    ["endRfuPtr", "double", SIZE_CT_COMMON],
    ["dfPtr", "double", SIZE_CT_COMMON],
    ["shtPtr", "double", SIZE_CT_COMMON],
    ["sht2Ptr", "double", SIZE_CT_COMMON],
    ["lsrValPtr", "double", SIZE_CT_COMMON],
    ["rdDiffDataPtr", "double", SIZE_FULL],
    ["origRfuPtr", "double", SIZE_FULL],
    ["preprocRfuPtr", "double", SIZE_FULL],
    ["ivdCddPtr", "double", SIZE_FULL],
    ["cffPtr", "double", 2 * SIZE_CT_COMMON],
    ["scdFitPtr", "double", SIZE_FULL],
    ["r2Ptr", "double", SIZE_CT_COMMON],
    ["rp2Ptr", "double", SIZE_CT_COMMON],
    ["efcPtr", "int", SIZE_CT_COMMON],
    ["absdOrigDataPtr", "double", SIZE_FULL],
    ["absdDataPtr", "double", SIZE_FULL],
    ["fDataPtr", "double", SIZE_FULL],
    ["fNewDataPtr", "double", SIZE_FULL],
    ["paramPtr", "double", 4 * SIZE_CT_COMMON],
    ["paramNewPtr", "double", 4 * SIZE_CT_COMMON],
    ["thrdPtr", "double", SIZE_CT_COMMON],
    ["normalizationResultPtr", "double", SIZE_FULL],
  ];

  const basesubOutputBufferDefs = [
    ["origRfuPtr", "double", SIZE_FULL],
    ["preprocRfuPtr", "double", SIZE_FULL],
    ["rdDiffDataPtr", "double", SIZE_FULL],
    ["scdFitPtr", "double", SIZE_FULL],
    ["rp2Ptr", "double", SIZE_CT_COMMON],
    ["efcPtr", "int", SIZE_CT_COMMON],
    ["thrdPtr", "double", SIZE_CT_COMMON],
    ["finalResultWellPtr", "int", SIZE_CT_COMMON],
    ["finalDataProcessNumPtr", "int", SIZE_CT_COMMON],
    ["lsrValPtr", "double", SIZE_CT_COMMON],
    ["endRfuPtr", "double", SIZE_CT_COMMON],
    ["absdOrigDataPtr", "double", SIZE_FULL],
    ["absdDataPtr", "double", SIZE_FULL],
  ];

  // 3. 정의된 데이터를 사용하여 버퍼 생성
  dspOutputPtr = createBuffersFromDefs(dspOutputBufferDefs);
  basesubOutputPtr = createBuffersFromDefs(basesubOutputBufferDefs);
};

const deallocBuffer = () => {
  // Memory deallocation - Outputs (Analysis)
  for (const buffer of Object.values(dspOutputPtr)) {
    if (buffer) {
      koffi.free(buffer);
    }
  }

  // Memory deallocation - Outputs (Basesubtr)
  for (const buffer of Object.values(basesubOutputPtr)) {
    if (buffer) {
      koffi.free(buffer);
    }
  }
};

let run_dsp_exona = null;

/**
 * 채널별 설정 값을 생성하는 헬퍼 함수
 * @param {object} setting - 현재 채널의 알고리즘 설정
 * @param {object} temp - 현재 채널의 usedTemp 값
 * @returns {number[]} 해당 채널에 대한 설정 값 배열
 */
const buildChannelSettings = (setting, temp) => {
  const step0 = setting.Step[0];
  const isDualTemp = setting.Step.length === 2;
  // 듀얼 온도가 아니면 step1을 step0으로 간주하여 중복을 제거
  const step1 = isDualTemp ? setting.Step[1] : step0;

  const bpnSettings = (() => {
    if (step0.BPN.RV === 0) {
      // BPN Switch Off
      return [0, 0, 0, 0, 0];
    }
    // BPN Switch On
    return [
      1,
      step0.BPN.StartCycle,
      step0.BPN.EndCycle,
      step0.BPN.RV, // BPN RV LOW
      step1.BPN.RV, // BPN RV HIGH
    ];
  })();

  return [
    temp.low, // usedTemp LOW
    temp.high, // useTemp HIGH
    step0.DSP.SFC,
    step0.DSP.MFC,
    ...bpnSettings,
    isDualTemp ? setting.MuDT.CR : 0, // CR
    step0.PostProcess.CtCutoff, // CUT OFF LOW
    step1.PostProcess.CtCutoff, // CUT OFF HIGH
    step0.DSP.PMC, // PMC LOW
    step1.DSP.PMC, // PMC HIGH
    step0.DSP.dRFU, // DRFU LOW
    step1.DSP.dRFU, // DRFU HIGH
    step0.DSP.Threshold, // THRD LOW
    step1.DSP.Threshold, // THRD HIGH
    step0.DSP.RparSquare, // RPC LOW
    step1.DSP.RparSquare, // RPC HIGH
    step0.DSP.RSquare, // RC LOW
    step1.DSP.RSquare, // RC HIGH
    step0.DSP.dfM, // DFM LOW
    step1.DSP.dfM, // DFM HIGH
    step0.DSP.dfC, // DFC LOW
    step1.DSP.dfC, // DFC HIGH
    step0.PostProcess.dRFU2 ?? 0,
    step0.PostProcess.dRFU3 ?? 0,
  ];
};

/**
 * 최종 설정 값 배열을 만드는 메인 함수
 * @param {object[]} algorithmSettings - 특정 타입(SAMPLE, PC, NC)으로 필터링 및 정렬된 설정 배열
 * @param {object[]} usedTemp - 전체 채널에 대한 온도 값 배열
 * @param {number} numChannels - 총 채널 수
 * @param {number} ispc - PC 여부 (0 또는 1)
 * @returns {number[]} C FFI로 전달될 최종 1차원 배열
 */
const makeSettings = (algorithmSettings, usedTemp, numChannels, ispc) => {
  // 채널 번호를 키로 하는 Map을 생성하여 O(1) 시간 복잡도로 설정에 접근
  const settingsMap = new Map(
    algorithmSettings.map((setting) => [setting.channel, setting])
  );

  // 하나의 채널에 대한 설정 항목의 개수 (하드코딩 대신 상수로 관리)
  const finalSettings = [];

  for (let chidx = 0; chidx < numChannels; chidx++) {
    const channelNum = chidx + 1;
    const currentSetting = settingsMap.get(channelNum);

    if (currentSetting) {
      // 해당 채널에 설정이 있는 경우
      const channelValues = buildChannelSettings(
        currentSetting,
        usedTemp[chidx]
      );
      const step0 = currentSetting.Step[0];
      const isDualTemp = currentSetting.Step.length === 2;
      const step1 = isDualTemp ? currentSetting.Step[1] : step0;

      finalSettings.push(
        ...channelValues,
        ispc,
        step0.DSP.isMultiAmp, // isMultiAmp LOW
        step1.DSP.isMultiAmp, // isMultiAmp HIGH
        step0.DSP.fb,
        1, // AR LOW
        1, // AR HIGH
        step0.DSP.DataScale, // Data scale LOW
        step0.DSP.DataScale, // Data scale HIGH
        step0.DSP.EarlyAmpCriteria, // EAT LOW
        step0.DSP.EarlyAmpCriteria // EAT HIGH
      );
    } else {
      // 해당 채널에 설정이 없는 경우 (skip)
      finalSettings.push(...new Array(NUM_OF_SETTINGS).fill(0));
    }
  }
  return finalSettings;
};

const DSP_DECODE_CONFIG = [
  {
    key: "analysisCtResult",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  { key: "finalCtResult", type: "double", getSize: (c, t, h) => h * t },
  {
    key: "finalResultWell",
    type: "int",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "finalDataProcessNum",
    type: "int",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "endRfu",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "df",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "sht",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "sht2",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "lsrVal",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "rdDiffData",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "origRfu",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "preprocRfu",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "ivdCdd",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "cff",
    type: "double",
    getSize: (c, t, h) => 2 * h * t,
  },
  {
    key: "scdFit",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "r2",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "rp2",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "efc",
    type: "int",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "absdOrigData",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "absdData",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "fData",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "fNewData",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "param",
    type: "double",
    getSize: (c, t, h) => 4 * h * t,
  },
  {
    key: "paramNew",
    type: "double",
    getSize: (c, t, h) => 4 * h * t,
  },
  {
    key: "thrd",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "normalizationResult",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
];
const BASESUB_DECODE_CONFIG = [
  {
    key: "origRfu",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "preprocRfu",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "rdDiffData",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "scdFit",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "rp2",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "efc",
    type: "int",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "thrd",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "finalResultWell",
    type: "int",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "finalDataProcessNum",
    type: "int",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "lsrVal",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "endRfu",
    type: "double",
    getSize: (c, t, h) => h * t,
  },
  {
    key: "absdOrigData",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
  {
    key: "absdData",
    type: "double",
    getSize: (c, t, h) => c * h * t,
  },
];
const getMem = (numCycles, numTempers, numChannels) => {
  const dspResults = DSP_DECODE_CONFIG.reduce((acc, config) => {
    const pointerKey = `${config.key}Ptr`;
    const pointer = dspOutputPtr[pointerKey];
    const size = config.getSize(numCycles, numTempers, numChannels);

    acc[config.key] = koffi.decode(pointer, config.type, size);
    return acc;
  }, {});

  const basesubResults = BASESUB_DECODE_CONFIG.reduce((acc, config) => {
    const pointerKey = `${config.key}Ptr`;
    const pointer = basesubOutputPtr[pointerKey];
    const size = config.getSize(numCycles, numTempers, numChannels);

    acc[`basesub_${config.key}`] = koffi.decode(pointer, config.type, size);
    return acc;
  }, {});
  return { ...dspResults, ...basesubResults };
};

/**
 * 배열에서 특정 인덱스에 해당하는 데이터를 잘라내는 헬퍼 함수
 * @param {Array} sourceArray 원본 배열
 * @param {number} index 데이터를 가져올 기준 인덱스
 * @param {number} size 잘라낼 데이터의 크기
 * @returns {Array} 잘라낸 배열
 */
const getSlicedData = (sourceArray, index, size) => {
  return sourceArray.slice(index * size, index * size + size);
};

/**
 * DSPA 및 Baseline 결과 객체를 생성합니다.
 * @param {object} dsp - DSP 결과 데이터 묶음
 * @param {object} baseline - Baseline 결과 데이터 묶음
 * @param {number} flatIndex - 1차원 배열에 접근하기 위한 인덱스
 * @param {number} numCycles - 사이클 수
 * @returns {{ anlssRsltFinal: object, baselineSubstRsltFinal: object }}
 */
const createResultDataObject = (dsp, baseline, flatIndex, numCycles) => {
  const anlssRsltFinal = {
    well: dsp.wellId,
    rdngrslt: dsp.finalResultWell[flatIndex],
    negCd: dsp.finalDataprocessNum[flatIndex],
    endrfu: dsp.endRFU[flatIndex],
    sht: dsp.sht[flatIndex],
    lsr: dsp.lsrVal[flatIndex],
    rd: getSlicedData(dsp.rdDiffData, flatIndex, numCycles),
    mudtRd: getSlicedData(dsp.preprocRfu, flatIndex, numCycles),
    ivdCdd: getSlicedData(dsp.ivdCdd, flatIndex, numCycles),
    cff: getSlicedData(dsp.cff, flatIndex, 2),
    scdFit: getSlicedData(dsp.scdFit, flatIndex, numCycles),
    r2: dsp.r2[flatIndex],
    rp2: dsp.rp2[flatIndex],
    efc: dsp.efc[flatIndex],
    aftrbslnsbtrctddtOrgnl: getSlicedData(
      dsp.absdOrigData,
      flatIndex,
      numCycles
    ),
    aftrbslnsbtrctddt: getSlicedData(dsp.absdData, flatIndex, numCycles),
    f: getSlicedData(dsp.fData, flatIndex, numCycles),
    fNew: getSlicedData(dsp.fNewData, flatIndex, numCycles),
    sigCffcnt: getSlicedData(dsp.param, flatIndex, 4),
    sigCffcntNew: getSlicedData(dsp.paramNew, flatIndex, 4),
    df: dsp.df[flatIndex],
    ct:
      dsp.analysisCtResult[flatIndex] === -1
        ? null
        : dsp.analysisCtResult[flatIndex],
    ctFinal:
      dsp.finalCtResult[flatIndex] === -1 ? null : dsp.finalCtResult[flatIndex],
    thrd: dsp.thrd[flatIndex],
  };

  const baselineSubstRsltFinal = {
    origRfu: getSlicedData(baseline.basesubOrigRfu, flatIndex, numCycles),
    preprocRfu: getSlicedData(baseline.basesubPreprocRfu, flatIndex, numCycles),
    rdDiff: getSlicedData(baseline.basesubRdDiffData, flatIndex, numCycles),
    scdFit: getSlicedData(baseline.basesubScdFit, flatIndex, numCycles),
    absdOrig: getSlicedData(baseline.basesubAbsdOrig, flatIndex, numCycles),
    absd: getSlicedData(baseline.basesubAbsd, flatIndex, numCycles),
    rp2: baseline.basesubRp2[flatIndex],
    efc: baseline.basesubEfc[flatIndex],
    thrd: baseline.basesubThrd[flatIndex],
    rdngrslt: baseline.basesubFinalResultWell[flatIndex],
    negCd: baseline.basesubFinalDataprocessNum[flatIndex],
    lsr: baseline.basesubLsrVal[flatIndex],
    endRFU: baseline.basesubEndRFU[flatIndex],
  };

  return { anlssRsltFinal, baselineSubstRsltFinal };
};

// 실제 Host에서 호출할 functions
/*
 * - init: 초기화 함수
 */
function init() {
  const libName = (() => {
    switch (process.platform) {
      case "darwin":
        return "libdsp_wrapper.dylib";
      case "win32":
        return "dsp_wrapper.dll";
      default: // linux
        return "libdsp_wrapper.so";
    }
  })();

  const lib = koffi.load(`lib/native/${libName}`);
  run_dsp_exona = lib.func("run_dsp_2ct", "int", [
    // --- 입력 값 매개변수 ---
    "int", // numchannels
    "int", // numtemperatures
    "double *", // setting_values
    "double *", // crosstalk_values
    "int", // numcrosstalk
    "double *", // raw_data_low
    "double *", // raw_data_high
    "int", // numcycles

    // --- 출력 값을 받을 포인터 매개변수 (Analysis) ---
    "double *", // analysis_ct_ret
    "double *", // fianl_ct_ret (참고: final의 오타일 수 있습니다)
    "int *", // final_result_well
    "int *", // final_dataprocess_num
    "double *", // end_rfu
    "double *", // df
    "double *", // sht
    "double *", // sht2
    "double *", // lsr_val
    "double *", // rd_diff_data
    "double *", // original_rfu
    "double *", // preproc_rfu
    "double *", // analysis_ivd_cdd_output
    "double *", // analysis_cff
    "double *", // analysis_scd_fit
    "double *", // analysis_r2
    "double *", // analysis_r_p2
    "int *", // analysis_efc
    "double *", // analysis_absd_orig
    "double *", // analysis_absd
    "double *", // analysis_f
    "double *", // analysis_f_new
    "double *", // analysis_param
    "double *", // analysis_param_new
    "double *", // setval_thrd
    "double *", // normalization_result

    // --- 출력 값을 받을 포인터 매개변수 (Basesubtr) ---
    "double *", // basesubtr_original_rfu
    "double *", // basesubtr_preproc_rfu
    "double *", // basesub_rd_diff
    "double *", // basesub_scd_fit
    "double *", // basesub_r_p2
    "int *", // basesub_efc
    "double *", // basesub_setval_thrd
    "int *", // basesub_final_resultwell
    "int *", // basesub_final_dataprocnum
    "double *", // basesub_lsr_val
    "double *", // basesub_endrfu
    "double *", // basesub_absd_orig
    "double *", // basesub_absd
  ]);
}

/*
 * - terminate: 종료 함수
 */
function terminate() {}

/*
 * - getVersion: 버전 정보 반환 함수
 */
function getVersion() {
  return "DSP Exona V3.0-beta.1";
}

/*
 * - main: 메인 함수
 * - props: JSON 형식의 입력 데이터
 * - 반환값: JSON 형식의 결과 데이터
 * - 주요 작업:
 *  1. 입력 데이터 파싱
 *  2. 메모리 할당
 *  3. 분석 알고리즘 실행 (per well)
 *  4. 결과 데이터 생성
 *  5. 메모리 해제
 */
function main(props) {
  /*
   *  Parsing props
   */
  // Num of channels 계산
  const numChannels = 5;
  // Cycle 개수 계산
  const numCycles = 45;
  // Temperature 개수 계산
  const numTempers = 2;

  // Used Temp
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

  // 1. Type별로 데이터를 그룹화합니다.
  const settingsByType = sortedSettings.reduce((acc, item) => {
    const { Type } = item;
    // acc에 해당 Type의 배열이 없으면 초기화하고, 있으면 기존 배열을 사용합니다.
    (acc[Type] = acc[Type] || []).push(item);
    return acc;
  }, {});

  // 2. 공통으로 사용할 정렬 함수를 정의합니다.
  const sortByChannel = (a, b) => a.channel - b.channel;

  // 3. 그룹화된 데이터를 정렬하여 makeSettings 함수를 호출합니다.
  //    - Optional Chaining(?.)과 Nullish Coalescing(??)을 사용해 해당 Type의 데이터가 없는 경우에도 안전하게 빈 배열을 전달합니다.
  const settingsArr = makeSettings(
    settingsByType.SAMPLE?.sort(sortByChannel) ?? [],
    usedTemp,
    numChannels,
    0
  );

  // Raw Data per well
  const rawDataLow = props.lowRfu;
  const rawDataHigh = props.highRfu;

  // Memory allocation
  allocBuffer();

  // Analysis
  run_dsp_exona(
    // Input
    numChannels,
    numTempers,
    settingsArr,
    0,
    0,
    rawDataLow,
    rawDataHigh,
    numCycles,
    // Output
    dspOutputPtr.analysisCtResultPtr,
    dspOutputPtr.finalCtResultPtr,
    dspOutputPtr.finalResultWellPtr,
    dspOutputPtr.finalDataProcessNumPtr,
    dspOutputPtr.endRfuPtr,
    dspOutputPtr.dfPtr,
    dspOutputPtr.shtPtr,
    dspOutputPtr.sht2Ptr,
    dspOutputPtr.lsrValPtr,
    dspOutputPtr.rdDiffDataPtr,
    dspOutputPtr.origRfuPtr,
    dspOutputPtr.preprocRfuPtr,
    dspOutputPtr.ivdCddPtr,
    dspOutputPtr.cffPtr,
    dspOutputPtr.scdFitPtr,
    dspOutputPtr.r2Ptr,
    dspOutputPtr.rp2Ptr,
    dspOutputPtr.efcPtr,
    dspOutputPtr.absdOrigDataPtr,
    dspOutputPtr.absdDataPtr,
    dspOutputPtr.fDataPtr,
    dspOutputPtr.fNewDataPtr,
    dspOutputPtr.paramPtr,
    dspOutputPtr.paramNewPtr,
    dspOutputPtr.thrdPtr,
    dspOutputPtr.normalizationResultPtr,
    basesubOutputPtr.origRfuPtr,
    basesubOutputPtr.preprocRfuPtr,
    basesubOutputPtr.rdDiffDataPtr,
    basesubOutputPtr.scdFitPtr,
    basesubOutputPtr.rp2Ptr,
    basesubOutputPtr.efcPtr,
    basesubOutputPtr.thrdPtr,
    basesubOutputPtr.finalResultWellPtr,
    basesubOutputPtr.finalDataProcessNumPtr,
    basesubOutputPtr.lsrValPtr,
    basesubOutputPtr.endRfuPtr,
    basesubOutputPtr.absdOrigDataPtr,
    basesubOutputPtr.absdDataPtr
  );

  // 결과 추출
  const results = getMem(numCycles, numTempers, numChannels);

  const dspResults = {
    analysisCtResult: results.analysisCtResult,
    finalCtResult: results.finalCtResult,
    finalResultWell: results.finalResultWell,
    finalDataprocessNum: results.finalDataProcessNum,
    endRFU: results.endRfu,
    df: results.df,
    sht: results.sht,
    sht2: results.sht2,
    lsrVal: results.lsrVal,
    rdDiffData: results.rdDiffData,
    origRfu: results.origRfu,
    preprocRfu: results.preprocRfu,
    ivdCdd: results.ivdCdd,
    cff: results.cff,
    scdFit: results.scdFit,
    r2: results.r2,
    rp2: results.rp2,
    efc: results.efc,
    absdOrigData: results.absdOrigData,
    absdData: results.absdData,
    fData: results.fData,
    fNewData: results.fNewData,
    param: results.param,
    paramNew: results.paramNew,
    thrd: results.thrd,
    normalizationResult: results.normalizationResult,
  };

  const baselineResults = {
    basesubFinalResultWell: results.basesub_finalResultWell,
    basesubFinalDataprocessNum: results.basesub_finalDataProcessNum,
    basesubEndRFU: results.basesub_endRfu,
    basesubLsrVal: results.basesub_lsrVal,
    basesubThrd: results.basesub_thrd,
    basesubEfc: results.basesub_efc,
    basesubRp2: results.basesub_rp2,
    basesubScdFit: results.basesub_scdFit,
    basesubRdDiffData: results.basesub_rdDiffData,
    basesubPreprocRfu: results.basesub_preprocRfu,
    basesubOrigRfu: results.basesub_origRfu,
    basesubAbsdOrig: results.basesub_absdOrigData,
    basesubAbsd: results.basesub_absdData,
  };

  const ret = {
    dsp: [],
    baselinesub: [],
  };

  for (let chidx = 0; chidx < numChannels * 2; chidx++) {
    for (let tidx = 0; tidx < numTempers; tidx++) {
      const i = chidx + tidx;

      const { anlssRsltFinal, baselineSubstRsltFinal } = createResultDataObject(
        { ...dspResults, wellId: props.wellId },
        baselineResults,
        i,
        numCycles
      );

      ret.dsp.push(anlssRsltFinal);
      ret.baselinesub.push(baselineSubstRsltFinal);
    }
  }

  // Memory deallocation
  deallocBuffer();

  return ret;
}

module.exports = {
  init,
  terminate,
  getVersion,
  main,
};
