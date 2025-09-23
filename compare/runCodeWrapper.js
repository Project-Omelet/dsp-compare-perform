const algorithmModulesOrigin = require("./lib/origin/analysis_script.js");
const algorithmModules = require("./lib/optimized/analysis_script.js");
const fs = require("fs");
const csv = require("csv-parser");

const readCsv = async (filePath) => {
  const result = [];
  const stream = fs.createReadStream(filePath).pipe(csv());

  for await (const row of stream) {
    const numberArray = row.rfu.match(/[\d.]+/g).map(Number);
    result.push({ well: row.well, rfu: numberArray });
  }
  return result;
};

exports.handler = async (context, filePath) => {
  await context.init();

  // Setting values
  const settingValues = [
    {
      channel: 1,
      Type: "SAMPLE",
      MuDT: {
        fb: 0,
        CR: 1.2,
        dRFU: 110.0,
        SFC: 4.0,
      },
      Step: [
        {
          step: "low",
          BPN: {
            RV: 4600.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.9,
            RSquare: 0.9,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
        {
          step: "high",
          BPN: {
            RV: 5100.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.94,
            RSquare: 0.94,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
      ],
    },
    {
      channel: 2,
      Type: "SAMPLE",
      MuDT: {
        fb: 0,
        CR: 1.2,
        dRFU: 110.0,
        SFC: 4.0,
      },
      Step: [
        {
          step: "low",
          BPN: {
            RV: 4600.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.9,
            RSquare: 0.9,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
        {
          step: "high",
          BPN: {
            RV: 5100.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.94,
            RSquare: 0.94,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
      ],
    },
    {
      channel: 3,
      Type: "SAMPLE",
      MuDT: {
        fb: 0,
        CR: 1.2,
        dRFU: 110.0,
        SFC: 4.0,
      },
      Step: [
        {
          step: "low",
          BPN: {
            RV: 4600.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.9,
            RSquare: 0.9,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
        {
          step: "high",
          BPN: {
            RV: 5100.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.94,
            RSquare: 0.94,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
      ],
    },
    {
      channel: 4,
      Type: "SAMPLE",
      MuDT: {
        fb: 0,
        CR: 1.2,
        dRFU: 110.0,
        SFC: 4.0,
      },
      Step: [
        {
          step: "low",
          BPN: {
            RV: 4600.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.9,
            RSquare: 0.9,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
        {
          step: "high",
          BPN: {
            RV: 5100.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.94,
            RSquare: 0.94,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
      ],
    },
    {
      channel: 5,
      Type: "SAMPLE",
      MuDT: {
        fb: 0,
        CR: 1.2,
        dRFU: 110.0,
        SFC: 4.0,
      },
      Step: [
        {
          step: "low",
          BPN: {
            RV: 4600.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.9,
            RSquare: 0.9,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
        {
          step: "high",
          BPN: {
            RV: 5100.0,
            StartCycle: 3,
            EndCycle: 8,
          },
          DSP: {
            dfM: 18.0,
            dfC: 30.0,
            fb: 0,
            DataScale: 1.0,
            EarlyAmpCriteria: 500.0,
            dRFU: 110.0,
            RparSquare: 0.94,
            RSquare: 0.94,
            PMC: 0.09,
            SFC: 4.0,
            MFC: 12.0,
            Threshold: 110.0,
            isMultiAmp: 0,
          },
          PostProcess: {
            dRFU2: 0.0,
            dRFU3: 0.0,
            CtCutoff: 45.0,
          },
          CalculateCt: {
            Threshold: 110.0,
          },
        },
      ],
    },
  ];

  // Plate
  const plate = await readCsv(filePath);

  const ret = [];

  for (let i = 0; i < plate.length; i += 10) {
    const lowRfu = [];
    const highRfu = [];
    for (let j = i; j < i + 10; j++) {
      if (j % 2) lowRfu.push(...plate[j].rfu);
      else highRfu.push(...plate[j].rfu);
    }

    const props = {
      settingValues,
      lowRfu,
      highRfu,
      wellId: plate[i].well,
    };

    const result = await context.main(props); // run

    ret.push({ wellId: plate[i].well, result });
  }

  return ret;
};

const main = async (context, mode, pathObj) => {
  const beforeMemory = process.memoryUsage();
  const startTime = Date.now();
  const result = await this.handler(context, pathObj.filePath);
  const endTime = Date.now() - startTime;
  const afterMemory = process.memoryUsage();

  fs.appendFileSync(
    `${pathObj.outputPath}/summary.txt`,
    `--- ${mode} Mode ---\n`
  );

  fs.appendFileSync(
    `${pathObj.outputPath}/summary.txt`,
    `--- Data Analysis Summary ---\n`
  );

  fs.appendFileSync(
    `${pathObj.outputPath}/summary.txt`,
    `Memory before: ${
      Math.round((beforeMemory.heapUsed / 1024 / 1024) * 100) / 100
    } MB\n`
  );

  fs.appendFileSync(
    `${pathObj.outputPath}/summary.txt`,
    `Memory after: ${
      Math.round((afterMemory.heapUsed / 1024 / 1024) * 100) / 100
    } MB\n`
  );

  const usedMemory = afterMemory.heapUsed - beforeMemory.heapUsed;

  fs.appendFileSync(
    `${pathObj.outputPath}/summary.txt`,
    "-------------------------------------------\n"
  );

  fs.appendFileSync(
    `${pathObj.outputPath}/summary.txt`,
    `Epoch time: ${endTime}\n`
  );

  fs.appendFileSync(
    `${pathObj.outputPath}/summary.txt`,
    `Memory used in analysis: ${
      Math.round((usedMemory / 1024 / 1024) * 100) / 100
    } MB\n`
  );

  fs.appendFileSync(
    `${pathObj.outputPath}/summary.txt`,
    "-------------------------------------------\n"
  );

  return result;
};

const debug = async (pathObj) => {
  const originTest = await main(algorithmModulesOrigin, "origin", pathObj);
  const optimizedTest = await main(algorithmModules, "optimized", pathObj);

  fs.writeFileSync(
    `${pathObj.outputPath}/originTest.json`,
    JSON.stringify(originTest, null, 2)
  );
  fs.writeFileSync(
    `${pathObj.outputPath}/optimizedTest.json`,
    JSON.stringify(optimizedTest, null, 2)
  );

  const areEqual = JSON.stringify(originTest) === JSON.stringify(optimizedTest);
  fs.writeFileSync(
    `${pathObj.outputPath}/comparison.txt`,
    `originTest equals optimizedTest: ${areEqual}`
  );
};

debug({ filePath: process.argv[2], outputPath: process.argv[3] });
