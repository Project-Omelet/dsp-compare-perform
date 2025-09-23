const { channel } = require("diagnostics_channel");

function initDsp2Module() {
  // include: shell.js
  // The Module object: Our interface to the outside world. We import
  // and export values on it. There are various ways Module can be used:
  // 1. Not defined. We create it here
  // 2. A function parameter, function(moduleArg) => Promise<Module>
  // 3. pre-run appended it, var Module = {}; ..generated code..
  // 4. External script tag defines var Module.
  // We need to check if Module already exists (e.g. case 3 above).
  // Substitution will be replaced with actual code on later stage of the build,
  // this way Closure Compiler will not mangle it (e.g. case 4. above).
  // Note that if you want to run closure, and also to use Module
  // after the generated code, you will need to define   var Module = {};
  // before the code. Then that object will be used in the code, and you
  // can continue to use Module afterwards as well.
  var Module = typeof Module != "undefined" ? Module : {};

  // Determine the runtime environment we are in. You can customize this by
  // setting the ENVIRONMENT setting at compile time (see settings.js).

  // Attempt to auto-detect the environment
  var ENVIRONMENT_IS_WEB = typeof window == "object";
  var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";
  // N.b. Electron.js environment is simultaneously a NODE-environment, but
  // also a web environment.
  var ENVIRONMENT_IS_NODE =
    typeof process == "object" &&
    process.versions?.node &&
    process.type != "renderer";
  var ENVIRONMENT_IS_SHELL =
    !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

  // --pre-jses are emitted after the Module integration code, so that they can
  // refer to Module (if they choose; they can also define Module)

  var arguments_ = [];
  var thisProgram = "./this.program";
  var quit_ = (status, toThrow) => {
    throw toThrow;
  };

  // In MODULARIZE mode _scriptName needs to be captured already at the very top of the page immediately when the page is parsed, so it is generated there
  // before the page load. In non-MODULARIZE modes generate it here.
  var _scriptName =
    typeof document != "undefined" ? document.currentScript?.src : undefined;

  if (typeof __filename != "undefined") {
    // Node
    _scriptName = __filename;
  } else if (ENVIRONMENT_IS_WORKER) {
    _scriptName = self.location.href;
  }

  // `/` should be present at the end if `scriptDirectory` is not empty
  var scriptDirectory = "";
  function locateFile(path) {
    if (Module["locateFile"]) {
      return Module["locateFile"](path, scriptDirectory);
    }
    return scriptDirectory + path;
  }

  // Hooks that are implemented differently in different runtime environments.
  var readAsync, readBinary;

  if (ENVIRONMENT_IS_NODE) {
    const isNode =
      typeof process == "object" &&
      process.versions?.node &&
      process.type != "renderer";
    if (!isNode)
      throw new Error(
        "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)"
      );

    var nodeVersion = process.versions.node;
    var numericVersion = nodeVersion.split(".").slice(0, 3);
    numericVersion =
      numericVersion[0] * 10000 +
      numericVersion[1] * 100 +
      numericVersion[2].split("-")[0] * 1;
    if (numericVersion < 160000) {
      throw new Error(
        "This emscripten-generated code requires node v16.0.0 (detected v" +
          nodeVersion +
          ")"
      );
    }

    // These modules will usually be used on Node.js. Load them eagerly to avoid
    // the complexity of lazy-loading.
    var fs = require("fs");

    scriptDirectory = __dirname + "/";

    // include: node_shell_read.js
    readBinary = (filename) => {
      // We need to re-wrap `file://` strings to URLs.
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename);
      assert(Buffer.isBuffer(ret));
      return ret;
    };

    readAsync = async (filename, binary = true) => {
      // See the comment in the `readBinary` function.
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename, binary ? undefined : "utf8");
      assert(binary ? Buffer.isBuffer(ret) : typeof ret == "string");
      return ret;
    };
    // end include: node_shell_read.js
    if (process.argv.length > 1) {
      thisProgram = process.argv[1].replace(/\\/g, "/");
    }

    arguments_ = process.argv.slice(2);

    // MODULARIZE will export the module in the proper place outside, we don't need to export here
    if (typeof module != "undefined") {
      module["exports"] = Module;
    }

    quit_ = (status, toThrow) => {
      process.exitCode = status;
      throw toThrow;
    };
  } else if (ENVIRONMENT_IS_SHELL) {
    const isNode =
      typeof process == "object" &&
      process.versions?.node &&
      process.type != "renderer";
    if (
      isNode ||
      typeof window == "object" ||
      typeof WorkerGlobalScope != "undefined"
    )
      throw new Error(
        "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)"
      );

    readBinary = (f) => {
      if (typeof readbuffer == "function") {
        return new Uint8Array(readbuffer(f));
      }
      let data = read(f, "binary");
      assert(typeof data == "object");
      return data;
    };

    readAsync = async (f) => readBinary(f);

    globalThis.clearTimeout ??= (id) => {};

    // spidermonkey lacks setTimeout but we use it above in readAsync.
    globalThis.setTimeout ??= (f) => f();

    // v8 uses `arguments_` whereas spidermonkey uses `scriptArgs`
    arguments_ = globalThis.arguments || globalThis.scriptArgs;

    if (typeof quit == "function") {
      quit_ = (status, toThrow) => {
        // Unlike node which has process.exitCode, d8 has no such mechanism. So we
        // have no way to set the exit code and then let the program exit with
        // that code when it naturally stops running (say, when all setTimeouts
        // have completed). For that reason, we must call `quit` - the only way to
        // set the exit code - but quit also halts immediately.  To increase
        // consistency with node (and the web) we schedule the actual quit call
        // using a setTimeout to give the current stack and any exception handlers
        // a chance to run.  This enables features such as addOnPostRun (which
        // expected to be able to run code after main returns).
        setTimeout(() => {
          if (!(toThrow instanceof ExitStatus)) {
            let toLog = toThrow;
            if (toThrow && typeof toThrow == "object" && toThrow.stack) {
              toLog = [toThrow, toThrow.stack];
            }
            err(`exiting due to exception: ${toLog}`);
          }
          quit(status);
        });
        throw toThrow;
      };
    }

    if (typeof print != "undefined") {
      // Prefer to use print/printErr where they exist, as they usually work better.
      globalThis.console ??= /** @type{!Console} */ ({});
      console.log = /** @type{!function(this:Console, ...*): undefined} */ (
        print
      );
      console.warn = console.error =
        /** @type{!function(this:Console, ...*): undefined} */ (
          globalThis.printErr ?? print
        );
    }
  }

  // Note that this includes Node.js workers when relevant (pthreads is enabled).
  // Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
  // ENVIRONMENT_IS_NODE.
  else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
      scriptDirectory = new URL(".", _scriptName).href; // includes trailing slash
    } catch {
      // Must be a `blob:` or `data:` URL (e.g. `blob:http://site.com/etc/etc`), we cannot
      // infer anything from them.
    }

    if (!(typeof window == "object" || typeof WorkerGlobalScope != "undefined"))
      throw new Error(
        "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)"
      );

    {
      // include: web_or_worker_shell_read.js
      if (ENVIRONMENT_IS_WORKER) {
        readBinary = (url) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.responseType = "arraybuffer";
          xhr.send(null);
          return new Uint8Array(/** @type{!ArrayBuffer} */ (xhr.response));
        };
      }

      readAsync = async (url) => {
        assert(!isFileURI(url), "readAsync does not work with file:// URLs");
        var response = await fetch(url, { credentials: "same-origin" });
        if (response.ok) {
          return response.arrayBuffer();
        }
        throw new Error(response.status + " : " + response.url);
      };
      // end include: web_or_worker_shell_read.js
    }
  } else {
    throw new Error("environment detection error");
  }

  var out = console.log.bind(console);
  var err = console.error.bind(console);

  var IDBFS = "IDBFS is no longer included by default; build with -lidbfs.js";
  var PROXYFS =
    "PROXYFS is no longer included by default; build with -lproxyfs.js";
  var WORKERFS =
    "WORKERFS is no longer included by default; build with -lworkerfs.js";
  var FETCHFS =
    "FETCHFS is no longer included by default; build with -lfetchfs.js";
  var ICASEFS =
    "ICASEFS is no longer included by default; build with -licasefs.js";
  var JSFILEFS =
    "JSFILEFS is no longer included by default; build with -ljsfilefs.js";
  var OPFS = "OPFS is no longer included by default; build with -lopfs.js";

  var NODEFS =
    "NODEFS is no longer included by default; build with -lnodefs.js";

  // perform assertions in shell.js after we set up out() and err(), as otherwise
  // if an assertion fails it cannot print the message

  // end include: shell.js

  // include: preamble.js
  // === Preamble library stuff ===

  // Documentation for the public APIs defined in this file must be updated in:
  //    site/source/docs/api_reference/preamble.js.rst
  // A prebuilt local version of the documentation is available at:
  //    site/build/text/docs/api_reference/preamble.js.txt
  // You can also build docs locally as HTML or other formats in site/
  // An online HTML version (which may be of a different version of Emscripten)
  //    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

  var wasmBinary;

  if (typeof WebAssembly != "object") {
    err("no native wasm support detected");
  }

  // Wasm globals

  //========================================
  // Runtime essentials
  //========================================

  // whether we are quitting the application. no code should run after this.
  // set in exit() and abort()
  var ABORT = false;

  // set by exit() and abort().  Passed to 'onExit' handler.
  // NOTE: This is also used as the process return code code in shell environments
  // but only when noExitRuntime is false.
  var EXITSTATUS;

  // In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
  // don't define it at all in release modes.  This matches the behaviour of
  // MINIMAL_RUNTIME.
  // TODO(sbc): Make this the default even without STRICT enabled.
  /** @type {function(*, string=)} */
  function assert(condition, text) {
    if (!condition) {
      abort("Assertion failed" + (text ? ": " + text : ""));
    }
  }

  // We used to include malloc/free by default in the past. Show a helpful error in
  // builds with assertions.

  /**
   * Indicates whether filename is delivered via file protocol (as opposed to http/https)
   * @noinline
   */
  var isFileURI = (filename) => filename.startsWith("file://");

  // include: runtime_common.js
  // include: runtime_stack_check.js
  // Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
  function writeStackCookie() {
    var max = _emscripten_stack_get_end();
    assert((max & 3) == 0);
    // If the stack ends at address zero we write our cookies 4 bytes into the
    // stack.  This prevents interference with SAFE_HEAP and ASAN which also
    // monitor writes to address zero.
    if (max == 0) {
      max += 4;
    }
    // The stack grow downwards towards _emscripten_stack_get_end.
    // We write cookies to the final two words in the stack and detect if they are
    // ever overwritten.
    HEAPU32[max >> 2] = 0x02135467;
    HEAPU32[(max + 4) >> 2] = 0x89bacdfe;
    // Also test the global address 0 for integrity.
    HEAPU32[0 >> 2] = 1668509029;
  }

  function checkStackCookie() {
    if (ABORT) return;
    var max = _emscripten_stack_get_end();
    // See writeStackCookie().
    if (max == 0) {
      max += 4;
    }
    var cookie1 = HEAPU32[max >> 2];
    var cookie2 = HEAPU32[(max + 4) >> 2];
    if (cookie1 != 0x02135467 || cookie2 != 0x89bacdfe) {
      abort(
        `Stack overflow! Stack cookie has been overwritten at ${ptrToString(
          max
        )}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(
          cookie2
        )} ${ptrToString(cookie1)}`
      );
    }
    // Also test the global address 0 for integrity.
    if (HEAPU32[0 >> 2] != 0x63736d65 /* 'emsc' */) {
      abort(
        "Runtime error: The application has corrupted its heap memory area (address zero)!"
      );
    }
  }
  // end include: runtime_stack_check.js
  // include: runtime_exceptions.js
  // end include: runtime_exceptions.js
  // include: runtime_debug.js
  var runtimeDebug = true; // Switch to false at runtime to disable logging at the right times

  // Used by XXXXX_DEBUG settings to output debug messages.
  function dbg(...args) {
    if (!runtimeDebug && typeof runtimeDebug != "undefined") return;
    // TODO(sbc): Make this configurable somehow.  Its not always convenient for
    // logging to show up as warnings.
    console.warn(...args);
  }

  // Endianness check
  (() => {
    var h16 = new Int16Array(1);
    var h8 = new Int8Array(h16.buffer);
    h16[0] = 0x6373;
    if (h8[0] !== 0x73 || h8[1] !== 0x63)
      throw "Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)";
  })();

  function consumedModuleProp(prop) {
    if (!Object.getOwnPropertyDescriptor(Module, prop)) {
      Object.defineProperty(Module, prop, {
        configurable: true,
        set() {
          abort(
            `Attempt to set \`Module.${prop}\` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'`
          );
        },
      });
    }
  }

  function makeInvalidEarlyAccess(name) {
    return () =>
      assert(
        false,
        `call to '${name}' via reference taken before Wasm module initialization`
      );
  }

  function ignoredModuleProp(prop) {
    if (Object.getOwnPropertyDescriptor(Module, prop)) {
      abort(
        `\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`
      );
    }
  }

  // forcing the filesystem exports a few things by default
  function isExportedByForceFilesystem(name) {
    return (
      name === "FS_createPath" ||
      name === "FS_createDataFile" ||
      name === "FS_createPreloadedFile" ||
      name === "FS_unlink" ||
      name === "addRunDependency" ||
      // The old FS has some functionality that WasmFS lacks.
      name === "FS_createLazyFile" ||
      name === "FS_createDevice" ||
      name === "removeRunDependency"
    );
  }

  /**
   * Intercept access to a global symbol.  This enables us to give informative
   * warnings/errors when folks attempt to use symbols they did not include in
   * their build, or no symbols that no longer exist.
   */
  function hookGlobalSymbolAccess(sym, func) {
    if (
      typeof globalThis != "undefined" &&
      !Object.getOwnPropertyDescriptor(globalThis, sym)
    ) {
      Object.defineProperty(globalThis, sym, {
        configurable: true,
        get() {
          func();
          return undefined;
        },
      });
    }
  }

  function missingGlobal(sym, msg) {
    hookGlobalSymbolAccess(sym, () => {
      warnOnce(`\`${sym}\` is not longer defined by emscripten. ${msg}`);
    });
  }

  missingGlobal("buffer", "Please use HEAP8.buffer or wasmMemory.buffer");
  missingGlobal("asm", "Please use wasmExports instead");

  function missingLibrarySymbol(sym) {
    hookGlobalSymbolAccess(sym, () => {
      // Can't `abort()` here because it would break code that does runtime
      // checks.  e.g. `if (typeof SDL === 'undefined')`.
      var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`;
      // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
      // library.js, which means $name for a JS name with no prefix, or name
      // for a JS name like _name.
      var librarySymbol = sym;
      if (!librarySymbol.startsWith("_")) {
        librarySymbol = "$" + sym;
      }
      msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`;
      if (isExportedByForceFilesystem(sym)) {
        msg +=
          ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you";
      }
      warnOnce(msg);
    });

    // Any symbol that is not included from the JS library is also (by definition)
    // not exported on the Module object.
    unexportedRuntimeSymbol(sym);
  }

  function unexportedRuntimeSymbol(sym) {
    if (!Object.getOwnPropertyDescriptor(Module, sym)) {
      Object.defineProperty(Module, sym, {
        configurable: true,
        get() {
          var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
          if (isExportedByForceFilesystem(sym)) {
            msg +=
              ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you";
          }
          abort(msg);
        },
      });
    }
  }

  // end include: runtime_debug.js
  // Memory management

  var wasmMemory;

  var /** @type {!Int8Array} */
    HEAP8,
    /** @type {!Uint8Array} */
    HEAPU8,
    /** @type {!Int16Array} */
    HEAP16,
    /** @type {!Uint16Array} */
    HEAPU16,
    /** @type {!Int32Array} */
    HEAP32,
    /** @type {!Uint32Array} */
    HEAPU32,
    /** @type {!Float32Array} */
    HEAPF32,
    /** @type {!Float64Array} */
    HEAPF64;

  // BigInt64Array type is not correctly defined in closure
  var /** not-@type {!BigInt64Array} */
    HEAP64,
    /* BigUint64Array type is not correctly defined in closure
/** not-@type {!BigUint64Array} */
    HEAPU64;

  var runtimeInitialized = false;

  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    HEAP8 = new Int8Array(b);
    HEAP16 = new Int16Array(b);
    HEAPU8 = new Uint8Array(b);
    HEAPU16 = new Uint16Array(b);
    Module["HEAP32"] = HEAP32 = new Int32Array(b);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
    HEAPF32 = new Float32Array(b);
    Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
    HEAP64 = new BigInt64Array(b);
    HEAPU64 = new BigUint64Array(b);
  }

  // include: memoryprofiler.js
  // end include: memoryprofiler.js
  // end include: runtime_common.js
  assert(
    typeof Int32Array != "undefined" &&
      typeof Float64Array !== "undefined" &&
      Int32Array.prototype.subarray != undefined &&
      Int32Array.prototype.set != undefined,
    "JS engine does not provide full typed array support"
  );

  function preRun() {
    if (Module["preRun"]) {
      if (typeof Module["preRun"] == "function")
        Module["preRun"] = [Module["preRun"]];
      while (Module["preRun"].length) {
        addOnPreRun(Module["preRun"].shift());
      }
    }
    consumedModuleProp("preRun");
    // Begin ATPRERUNS hooks
    callRuntimeCallbacks(onPreRuns);
    // End ATPRERUNS hooks
  }

  function initRuntime() {
    assert(!runtimeInitialized);
    runtimeInitialized = true;

    checkStackCookie();

    // No ATINITS hooks

    wasmExports["__wasm_call_ctors"]();

    // No ATPOSTCTORS hooks
  }

  function postRun() {
    checkStackCookie();
    // PThreads reuse the runtime from the main thread.

    if (Module["postRun"]) {
      if (typeof Module["postRun"] == "function")
        Module["postRun"] = [Module["postRun"]];
      while (Module["postRun"].length) {
        addOnPostRun(Module["postRun"].shift());
      }
    }
    consumedModuleProp("postRun");

    // Begin ATPOSTRUNS hooks
    callRuntimeCallbacks(onPostRuns);
    // End ATPOSTRUNS hooks
  }

  // A counter of dependencies for calling run(). If we need to
  // do asynchronous work before running, increment this and
  // decrement it. Incrementing must happen in a place like
  // Module.preRun (used by emcc to add file preloading).
  // Note that you can add dependencies in preRun, even though
  // it happens right before run - run will be postponed until
  // the dependencies are met.
  var runDependencies = 0;
  var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
  var runDependencyTracking = {};
  var runDependencyWatcher = null;

  function addRunDependency(id) {
    runDependencies++;

    Module["monitorRunDependencies"]?.(runDependencies);

    if (id) {
      assert(!runDependencyTracking[id]);
      runDependencyTracking[id] = 1;
      if (runDependencyWatcher === null && typeof setInterval != "undefined") {
        // Check for missing dependencies every few seconds
        runDependencyWatcher = setInterval(() => {
          if (ABORT) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null;
            return;
          }
          var shown = false;
          for (var dep in runDependencyTracking) {
            if (!shown) {
              shown = true;
              err("still waiting on run dependencies:");
            }
            err(`dependency: ${dep}`);
          }
          if (shown) {
            err("(end of list)");
          }
        }, 10000);
      }
    } else {
      err("warning: run dependency added without ID");
    }
  }

  function removeRunDependency(id) {
    runDependencies--;

    Module["monitorRunDependencies"]?.(runDependencies);

    if (id) {
      assert(runDependencyTracking[id]);
      delete runDependencyTracking[id];
    } else {
      err("warning: run dependency removed without ID");
    }
    if (runDependencies == 0) {
      if (runDependencyWatcher !== null) {
        clearInterval(runDependencyWatcher);
        runDependencyWatcher = null;
      }
      if (dependenciesFulfilled) {
        var callback = dependenciesFulfilled;
        dependenciesFulfilled = null;
        callback(); // can add another dependenciesFulfilled
      }
    }
  }

  /** @param {string|number=} what */
  function abort(what) {
    Module["onAbort"]?.(what);

    what = "Aborted(" + what + ")";
    // TODO(sbc): Should we remove printing and leave it up to whoever
    // catches the exception?
    err(what);

    ABORT = true;

    // Use a wasm runtime error, because a JS error might be seen as a foreign
    // exception, which means we'd run destructors on it. We need the error to
    // simply make the program stop.
    // FIXME This approach does not work in Wasm EH because it currently does not assume
    // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
    // a trap or not based on a hidden field within the object. So at the moment
    // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
    // allows this in the wasm spec.

    // Suppress closure compiler warning here. Closure compiler's builtin extern
    // definition for WebAssembly.RuntimeError claims it takes no arguments even
    // though it can.
    // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
    /** @suppress {checkTypes} */
    var e = new WebAssembly.RuntimeError(what);

    // Throw the error whether or not MODULARIZE is set because abort is used
    // in code paths apart from instantiation where an exception is expected
    // to be thrown when abort is called.
    throw e;
  }

  // show errors on likely calls to FS when it was not included
  var FS = {
    error() {
      abort(
        "Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with -sFORCE_FILESYSTEM"
      );
    },
    init() {
      FS.error();
    },
    createDataFile() {
      FS.error();
    },
    createPreloadedFile() {
      FS.error();
    },
    createLazyFile() {
      FS.error();
    },
    open() {
      FS.error();
    },
    mkdev() {
      FS.error();
    },
    registerDevice() {
      FS.error();
    },
    analyzePath() {
      FS.error();
    },

    ErrnoError() {
      FS.error();
    },
  };

  function createExportWrapper(name, nargs) {
    return (...args) => {
      assert(
        runtimeInitialized,
        `native function \`${name}\` called before runtime initialization`
      );
      var f = wasmExports[name];
      assert(f, `exported native function \`${name}\` not found`);
      // Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
      assert(
        args.length <= nargs,
        `native function \`${name}\` called with ${args.length} args but expects ${nargs}`
      );
      return f(...args);
    };
  }

  var wasmBinaryFile;

  function findWasmBinary() {
    return locateFile("dsp_v2_x.wasm");
  }

  function getBinarySync(file) {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    if (readBinary) {
      return readBinary(file);
    }
    throw "both async and sync fetching of the wasm failed";
  }

  async function getWasmBinary(binaryFile) {
    // If we don't have the binary yet, load it asynchronously using readAsync.
    if (!wasmBinary) {
      // Fetch the binary using readAsync
      try {
        var response = await readAsync(binaryFile);
        return new Uint8Array(response);
      } catch {
        // Fall back to getBinarySync below;
      }
    }

    // Otherwise, getBinarySync should be able to get it synchronously
    return getBinarySync(binaryFile);
  }

  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary = await getWasmBinary(binaryFile);
      var instance = await WebAssembly.instantiate(binary, imports);
      return instance;
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`);

      // Warn on some common problems.
      if (isFileURI(wasmBinaryFile)) {
        err(
          `warning: Loading from a file URI (${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`
        );
      }
      abort(reason);
    }
  }

  async function instantiateAsync(binary, binaryFile, imports) {
    if (
      !binary &&
      typeof WebAssembly.instantiateStreaming == "function" &&
      // Avoid instantiateStreaming() on Node.js environment for now, as while
      // Node.js v18.1.0 implements it, it does not have a full fetch()
      // implementation yet.
      //
      // Reference:
      //   https://github.com/emscripten-core/emscripten/pull/16917
      !ENVIRONMENT_IS_NODE &&
      // Shell environments don't have fetch.
      !ENVIRONMENT_IS_SHELL
    ) {
      try {
        var response = fetch(binaryFile, { credentials: "same-origin" });
        var instantiationResult = await WebAssembly.instantiateStreaming(
          response,
          imports
        );
        return instantiationResult;
      } catch (reason) {
        // We expect the most common failure cause to be a bad MIME type for the binary,
        // in which case falling back to ArrayBuffer instantiation should work.
        err(`wasm streaming compile failed: ${reason}`);
        err("falling back to ArrayBuffer instantiation");
        // fall back of instantiateArrayBuffer below
      }
    }
    return instantiateArrayBuffer(binaryFile, imports);
  }

  function getWasmImports() {
    // prepare imports
    return {
      env: wasmImports,
      wasi_snapshot_preview1: wasmImports,
    };
  }

  // Create the wasm instance.
  // Receives the wasm imports, returns the exports.
  async function createWasm() {
    // Load the wasm module and create an instance of using native support in the JS engine.
    // handle a generated wasm instance, receiving its exports and
    // performing other necessary setup
    /** @param {WebAssembly.Module=} module*/
    function receiveInstance(instance, module) {
      wasmExports = instance.exports;

      wasmMemory = wasmExports["memory"];

      assert(wasmMemory, "memory not found in wasm exports");
      updateMemoryViews();

      assignWasmExports(wasmExports);
      removeRunDependency("wasm-instantiate");
      return wasmExports;
    }
    // wait for the pthread pool (if any)
    addRunDependency("wasm-instantiate");

    // Prefer streaming instantiation if available.
    // Async compilation can be confusing when an error on the page overwrites Module
    // (for example, if the order of elements is wrong, and the one defining Module is
    // later), so we save Module and check it later.
    var trueModule = Module;
    function receiveInstantiationResult(result) {
      // 'result' is a ResultObject object which has both the module and instance.
      // receiveInstance() will swap in the exports (to Module.asm) so they can be called
      assert(
        Module === trueModule,
        "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?"
      );
      trueModule = null;
      // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
      // When the regression is fixed, can restore the above PTHREADS-enabled path.
      return receiveInstance(result["instance"]);
    }

    var info = getWasmImports();

    // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
    // to manually instantiate the Wasm module themselves. This allows pages to
    // run the instantiation parallel to any other async startup actions they are
    // performing.
    // Also pthreads and wasm workers initialize the wasm instance through this
    // path.
    if (Module["instantiateWasm"]) {
      return new Promise((resolve, reject) => {
        try {
          Module["instantiateWasm"](info, (mod, inst) => {
            resolve(receiveInstance(mod, inst));
          });
        } catch (e) {
          err(`Module.instantiateWasm callback failed with error: ${e}`);
          reject(e);
        }
      });
    }

    wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
    var exports = receiveInstantiationResult(result);
    return exports;
  }

  // end include: preamble.js

  // Begin JS library code

  class ExitStatus {
    name = "ExitStatus";
    constructor(status) {
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
  }

  var callRuntimeCallbacks = (callbacks) => {
    while (callbacks.length > 0) {
      // Pass the module as the first argument.
      callbacks.shift()(Module);
    }
  };
  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.push(cb);

  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.push(cb);

  /**
   * @param {number} ptr
   * @param {string} type
   */
  function getValue(ptr, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        return HEAP8[ptr];
      case "i8":
        return HEAP8[ptr];
      case "i16":
        return HEAP16[ptr >> 1];
      case "i32":
        return HEAP32[ptr >> 2];
      case "i64":
        return HEAP64[ptr >> 3];
      case "float":
        return HEAPF32[ptr >> 2];
      case "double":
        return HEAPF64[ptr >> 3];
      case "*":
        return HEAPU32[ptr >> 2];
      default:
        abort(`invalid type for getValue: ${type}`);
    }
  }

  var noExitRuntime = true;

  var ptrToString = (ptr) => {
    assert(typeof ptr === "number");
    // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
    ptr >>>= 0;
    return "0x" + ptr.toString(16).padStart(8, "0");
  };

  /**
   * @param {number} ptr
   * @param {number} value
   * @param {string} type
   */
  function setValue(ptr, value, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        HEAP8[ptr] = value;
        break;
      case "i8":
        HEAP8[ptr] = value;
        break;
      case "i16":
        HEAP16[ptr >> 1] = value;
        break;
      case "i32":
        HEAP32[ptr >> 2] = value;
        break;
      case "i64":
        HEAP64[ptr >> 3] = BigInt(value);
        break;
      case "float":
        HEAPF32[ptr >> 2] = value;
        break;
      case "double":
        HEAPF64[ptr >> 3] = value;
        break;
      case "*":
        HEAPU32[ptr >> 2] = value;
        break;
      default:
        abort(`invalid type for setValue: ${type}`);
    }
  }

  var stackRestore = (val) => __emscripten_stack_restore(val);

  var stackSave = () => _emscripten_stack_get_current();

  var warnOnce = (text) => {
    warnOnce.shown ||= {};
    if (!warnOnce.shown[text]) {
      warnOnce.shown[text] = 1;
      if (ENVIRONMENT_IS_NODE) text = "warning: " + text;
      err(text);
    }
  };

  class ExceptionInfo {
    // excPtr - Thrown object pointer to wrap. Metadata pointer is calculated from it.
    constructor(excPtr) {
      this.excPtr = excPtr;
      this.ptr = excPtr - 24;
    }

    set_type(type) {
      HEAPU32[(this.ptr + 4) >> 2] = type;
    }

    get_type() {
      return HEAPU32[(this.ptr + 4) >> 2];
    }

    set_destructor(destructor) {
      HEAPU32[(this.ptr + 8) >> 2] = destructor;
    }

    get_destructor() {
      return HEAPU32[(this.ptr + 8) >> 2];
    }

    set_caught(caught) {
      caught = caught ? 1 : 0;
      HEAP8[this.ptr + 12] = caught;
    }

    get_caught() {
      return HEAP8[this.ptr + 12] != 0;
    }

    set_rethrown(rethrown) {
      rethrown = rethrown ? 1 : 0;
      HEAP8[this.ptr + 13] = rethrown;
    }

    get_rethrown() {
      return HEAP8[this.ptr + 13] != 0;
    }

    // Initialize native structure fields. Should be called once after allocated.
    init(type, destructor) {
      this.set_adjusted_ptr(0);
      this.set_type(type);
      this.set_destructor(destructor);
    }

    set_adjusted_ptr(adjustedPtr) {
      HEAPU32[(this.ptr + 16) >> 2] = adjustedPtr;
    }

    get_adjusted_ptr() {
      return HEAPU32[(this.ptr + 16) >> 2];
    }
  }

  var exceptionLast = 0;

  var uncaughtExceptionCount = 0;
  var ___cxa_throw = (ptr, type, destructor) => {
    var info = new ExceptionInfo(ptr);
    // Initialize ExceptionInfo content after it was allocated in __cxa_allocate_exception.
    info.init(type, destructor);
    exceptionLast = ptr;
    uncaughtExceptionCount++;
    assert(
      false,
      "Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch."
    );
  };

  var __abort_js = () => abort("native code called abort()");

  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
    assert(
      typeof str === "string",
      `stringToUTF8Array expects a string (got ${typeof str})`
    );
    // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
    // undefined and false each don't write out any bytes.
    if (!(maxBytesToWrite > 0)) return 0;

    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
    for (var i = 0; i < str.length; ++i) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
      // and https://www.ietf.org/rfc/rfc2279.txt
      // and https://tools.ietf.org/html/rfc3629
      var u = str.codePointAt(i);
      if (u <= 0x7f) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 0x7ff) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 0xc0 | (u >> 6);
        heap[outIdx++] = 0x80 | (u & 63);
      } else if (u <= 0xffff) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 0xe0 | (u >> 12);
        heap[outIdx++] = 0x80 | ((u >> 6) & 63);
        heap[outIdx++] = 0x80 | (u & 63);
      } else {
        if (outIdx + 3 >= endIdx) break;
        if (u > 0x10ffff)
          warnOnce(
            "Invalid Unicode code point " +
              ptrToString(u) +
              " encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF)."
          );
        heap[outIdx++] = 0xf0 | (u >> 18);
        heap[outIdx++] = 0x80 | ((u >> 12) & 63);
        heap[outIdx++] = 0x80 | ((u >> 6) & 63);
        heap[outIdx++] = 0x80 | (u & 63);
        // Gotcha: if codePoint is over 0xFFFF, it is represented as a surrogate pair in UTF-16.
        // We need to manually skip over the second code unit for correct iteration.
        i++;
      }
    }
    // Null-terminate the pointer to the buffer.
    heap[outIdx] = 0;
    return outIdx - startIdx;
  };
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
    assert(
      typeof maxBytesToWrite == "number",
      "stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!"
    );
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
  };

  var lengthBytesUTF8 = (str) => {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
      // unit, not a Unicode code point of the character! So decode
      // UTF16->UTF32->UTF8.
      // See http://unicode.org/faq/utf_bom.html#utf16-3
      var c = str.charCodeAt(i); // possibly a lead surrogate
      if (c <= 0x7f) {
        len++;
      } else if (c <= 0x7ff) {
        len += 2;
      } else if (c >= 0xd800 && c <= 0xdfff) {
        len += 4;
        ++i;
      } else {
        len += 3;
      }
    }
    return len;
  };
  var __tzset_js = (timezone, daylight, std_name, dst_name) => {
    // TODO: Use (malleable) environment variables instead of system settings.
    var currentYear = new Date().getFullYear();
    var winter = new Date(currentYear, 0, 1);
    var summer = new Date(currentYear, 6, 1);
    var winterOffset = winter.getTimezoneOffset();
    var summerOffset = summer.getTimezoneOffset();

    // Local standard timezone offset. Local standard time is not adjusted for
    // daylight savings.  This code uses the fact that getTimezoneOffset returns
    // a greater value during Standard Time versus Daylight Saving Time (DST).
    // Thus it determines the expected output during Standard Time, and it
    // compares whether the output of the given date the same (Standard) or less
    // (DST).
    var stdTimezoneOffset = Math.max(winterOffset, summerOffset);

    // timezone is specified as seconds west of UTC ("The external variable
    // `timezone` shall be set to the difference, in seconds, between
    // Coordinated Universal Time (UTC) and local standard time."), the same
    // as returned by stdTimezoneOffset.
    // See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
    HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;

    HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);

    var extractZone = (timezoneOffset) => {
      // Why inverse sign?
      // Read here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
      var sign = timezoneOffset >= 0 ? "-" : "+";

      var absOffset = Math.abs(timezoneOffset);
      var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
      var minutes = String(absOffset % 60).padStart(2, "0");

      return `UTC${sign}${hours}${minutes}`;
    };

    var winterName = extractZone(winterOffset);
    var summerName = extractZone(summerOffset);
    assert(winterName);
    assert(summerName);
    assert(
      lengthBytesUTF8(winterName) <= 16,
      `timezone name truncated to fit in TZNAME_MAX (${winterName})`
    );
    assert(
      lengthBytesUTF8(summerName) <= 16,
      `timezone name truncated to fit in TZNAME_MAX (${summerName})`
    );
    if (summerOffset < winterOffset) {
      // Northern hemisphere
      stringToUTF8(winterName, std_name, 17);
      stringToUTF8(summerName, dst_name, 17);
    } else {
      stringToUTF8(winterName, dst_name, 17);
      stringToUTF8(summerName, std_name, 17);
    }
  };

  var _emscripten_get_now = () => performance.now();

  var _emscripten_date_now = () => Date.now();

  var nowIsMonotonic = 1;

  var checkWasiClock = (clock_id) => clock_id >= 0 && clock_id <= 3;

  var INT53_MAX = 9007199254740992;

  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) =>
    num < INT53_MIN || num > INT53_MAX ? NaN : Number(num);
  function _clock_time_get(clk_id, ignored_precision, ptime) {
    ignored_precision = bigintToI53Checked(ignored_precision);

    if (!checkWasiClock(clk_id)) {
      return 28;
    }
    var now;
    // all wasi clocks but realtime are monotonic
    if (clk_id === 0) {
      now = _emscripten_date_now();
    } else if (nowIsMonotonic) {
      now = _emscripten_get_now();
    } else {
      return 52;
    }
    // "now" is in ms, and wasi times are in ns.
    var nsec = Math.round(now * 1000 * 1000);
    HEAP64[ptime >> 3] = BigInt(nsec);
    return 0;
  }

  var getHeapMax = () =>
    // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
    // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
    // for any code that deals with heap sizes, which would require special
    // casing all heap size related code to treat 0 specially.
    2147483648;

  var alignMemory = (size, alignment) => {
    assert(alignment, "alignment argument is required");
    return Math.ceil(size / alignment) * alignment;
  };

  var growMemory = (size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength;
    var pages = ((size - oldHeapSize + 65535) / 65536) | 0;
    try {
      // round size grow request up to wasm page size (fixed 64KB per spec)
      wasmMemory.grow(pages); // .grow() takes a delta compared to the previous size
      updateMemoryViews();
      return 1 /*success*/;
    } catch (e) {
      err(
        `growMemory: Attempted to grow heap from ${oldHeapSize} bytes to ${size} bytes, but got error: ${e}`
      );
    }
    // implicit 0 return to save code size (caller will cast "undefined" into 0
    // anyhow)
  };
  var _emscripten_resize_heap = (requestedSize) => {
    var oldSize = HEAPU8.length;
    // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
    requestedSize >>>= 0;
    // With multithreaded builds, races can happen (another thread might increase the size
    // in between), so return a failure, and let the caller retry.
    assert(requestedSize > oldSize);

    // Memory resize rules:
    // 1.  Always increase heap size to at least the requested size, rounded up
    //     to next page multiple.
    // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
    //     geometrically: increase the heap size according to
    //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
    //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
    // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
    //     linearly: increase the heap size by at least
    //     MEMORY_GROWTH_LINEAR_STEP bytes.
    // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
    //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
    // 4.  If we were unable to allocate as much memory, it may be due to
    //     over-eager decision to excessively reserve due to (3) above.
    //     Hence if an allocation fails, cut down on the amount of excess
    //     growth, in an attempt to succeed to perform a smaller allocation.

    // A limit is set for how much we can grow. We should not exceed that
    // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize) {
      err(
        `Cannot enlarge memory, requested ${requestedSize} bytes, but the limit is ${maxHeapSize} bytes!`
      );
      return false;
    }

    // Loop through potential heap size increases. If we attempt a too eager
    // reservation that fails, cut down on the attempted size and reserve a
    // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
      // but limit overreserving (default to capping at +96MB overgrowth at most)
      overGrownHeapSize = Math.min(
        overGrownHeapSize,
        requestedSize + 100663296
      );

      var newSize = Math.min(
        maxHeapSize,
        alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536)
      );

      var replacement = growMemory(newSize);
      if (replacement) {
        return true;
      }
    }
    err(
      `Failed to grow the heap from ${oldSize} bytes to ${newSize} bytes, not enough memory!`
    );
    return false;
  };

  var ENV = {};

  var getExecutableName = () => thisProgram || "./this.program";
  var getEnvStrings = () => {
    if (!getEnvStrings.strings) {
      // Default values.
      // Browser language detection #8751
      var lang =
        ((typeof navigator == "object" && navigator.language) || "C").replace(
          "-",
          "_"
        ) + ".UTF-8";
      var env = {
        USER: "web_user",
        LOGNAME: "web_user",
        PATH: "/",
        PWD: "/",
        HOME: "/home/web_user",
        LANG: lang,
        _: getExecutableName(),
      };
      // Apply the user-provided values, if any.
      for (var x in ENV) {
        // x is a key in ENV; if ENV[x] is undefined, that means it was
        // explicitly set to be so. We allow user code to do that to
        // force variables with default values to remain unset.
        if (ENV[x] === undefined) delete env[x];
        else env[x] = ENV[x];
      }
      var strings = [];
      for (var x in env) {
        strings.push(`${x}=${env[x]}`);
      }
      getEnvStrings.strings = strings;
    }
    return getEnvStrings.strings;
  };

  var _environ_get = (__environ, environ_buf) => {
    var bufSize = 0;
    var envp = 0;
    for (var string of getEnvStrings()) {
      var ptr = environ_buf + bufSize;
      HEAPU32[(__environ + envp) >> 2] = ptr;
      bufSize += stringToUTF8(string, ptr, Infinity) + 1;
      envp += 4;
    }
    return 0;
  };

  var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
    var strings = getEnvStrings();
    HEAPU32[penviron_count >> 2] = strings.length;
    var bufSize = 0;
    for (var string of strings) {
      bufSize += lengthBytesUTF8(string) + 1;
    }
    HEAPU32[penviron_buf_size >> 2] = bufSize;
    return 0;
  };

  var UTF8Decoder =
    typeof TextDecoder != "undefined" ? new TextDecoder() : undefined;

  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead;
    if (ignoreNul) return maxIdx;
    // TextDecoder needs to know the byte length in advance, it doesn't stop on
    // null terminator by itself.
    // As a tiny code save trick, compare idx against maxIdx using a negation,
    // so that maxBytesToRead=undefined/NaN means Infinity.
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
    return idx;
  };

  /**
   * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
   * array that contains uint8 values, returns a copy of that string as a
   * Javascript String object.
   * heapOrArray is either a regular array, or a JavaScript typed array view.
   * @param {number=} idx
   * @param {number=} maxBytesToRead
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);

    // When using conditional TextDecoder, skip it for short strings as the overhead of the native call is not worth it.
    if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
      return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
    }
    var str = "";
    // If building with TextDecoder, we have already computed the string length
    // above, so test loop end condition against that
    while (idx < endPtr) {
      // For UTF8 byte structure, see:
      // http://en.wikipedia.org/wiki/UTF-8#Description
      // https://www.ietf.org/rfc/rfc2279.txt
      // https://tools.ietf.org/html/rfc3629
      var u0 = heapOrArray[idx++];
      if (!(u0 & 0x80)) {
        str += String.fromCharCode(u0);
        continue;
      }
      var u1 = heapOrArray[idx++] & 63;
      if ((u0 & 0xe0) == 0xc0) {
        str += String.fromCharCode(((u0 & 31) << 6) | u1);
        continue;
      }
      var u2 = heapOrArray[idx++] & 63;
      if ((u0 & 0xf0) == 0xe0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        if ((u0 & 0xf8) != 0xf0)
          warnOnce(
            "Invalid UTF-8 leading byte " +
              ptrToString(u0) +
              " encountered when deserializing a UTF-8 string in wasm memory to a JS string!"
          );
        u0 =
          ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
      }

      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xd800 | (ch >> 10), 0xdc00 | (ch & 0x3ff));
      }
    }
    return str;
  };

  /**
   * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
   * emscripten HEAP, returns a copy of that string as a Javascript String object.
   *
   * @param {number} ptr
   * @param {number=} maxBytesToRead - An optional length that specifies the
   *   maximum number of bytes to read. You can omit this parameter to scan the
   *   string until the first 0 byte. If maxBytesToRead is passed, and the string
   *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
   *   string will cut short at that byte index.
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
    assert(
      typeof ptr == "number",
      `UTF8ToString expects a number (got ${typeof ptr})`
    );
    return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "";
  };
  var SYSCALLS = {
    varargs: undefined,
    getStr(ptr) {
      var ret = UTF8ToString(ptr);
      return ret;
    },
  };
  var _fd_close = (fd) => {
    abort("fd_close called without SYSCALLS_REQUIRE_FILESYSTEM");
  };

  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);

    return 70;
  }

  var printCharBuffers = [null, [], []];

  var printChar = (stream, curr) => {
    var buffer = printCharBuffers[stream];
    assert(buffer);
    if (curr === 0 || curr === 10) {
      (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
      buffer.length = 0;
    } else {
      buffer.push(curr);
    }
  };

  var flush_NO_FILESYSTEM = () => {
    // flush anything remaining in the buffers during shutdown
    _fflush(0);
    if (printCharBuffers[1].length) printChar(1, 10);
    if (printCharBuffers[2].length) printChar(2, 10);
  };

  var _fd_write = (fd, iov, iovcnt, pnum) => {
    // hack to support printf in SYSCALLS_REQUIRE_FILESYSTEM=0
    var num = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAPU32[iov >> 2];
      var len = HEAPU32[(iov + 4) >> 2];
      iov += 8;
      for (var j = 0; j < len; j++) {
        printChar(fd, HEAPU8[ptr + j]);
      }
      num += len;
    }
    HEAPU32[pnum >> 2] = num;
    return 0;
  };
  // End JS library code

  // include: postlibrary.js
  // This file is included after the automatically-generated JS library code
  // but before the wasm module is created.

  {
    // Begin ATMODULES hooks
    if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
    if (Module["print"]) out = Module["print"];
    if (Module["printErr"]) err = Module["printErr"];
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];

    Module["FS_createDataFile"] = FS.createDataFile;
    Module["FS_createPreloadedFile"] = FS.createPreloadedFile;

    // End ATMODULES hooks

    checkIncomingModuleAPI();

    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];

    // Assertions on removed incoming Module JS APIs.
    assert(
      typeof Module["memoryInitializerPrefixURL"] == "undefined",
      "Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead"
    );
    assert(
      typeof Module["pthreadMainPrefixURL"] == "undefined",
      "Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead"
    );
    assert(
      typeof Module["cdInitializerPrefixURL"] == "undefined",
      "Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead"
    );
    assert(
      typeof Module["filePackagePrefixURL"] == "undefined",
      "Module.filePackagePrefixURL option was removed, use Module.locateFile instead"
    );
    assert(
      typeof Module["read"] == "undefined",
      "Module.read option was removed"
    );
    assert(
      typeof Module["readAsync"] == "undefined",
      "Module.readAsync option was removed (modify readAsync in JS)"
    );
    assert(
      typeof Module["readBinary"] == "undefined",
      "Module.readBinary option was removed (modify readBinary in JS)"
    );
    assert(
      typeof Module["setWindowTitle"] == "undefined",
      "Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)"
    );
    assert(
      typeof Module["TOTAL_MEMORY"] == "undefined",
      "Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY"
    );
    assert(
      typeof Module["ENVIRONMENT"] == "undefined",
      "Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)"
    );
    assert(
      typeof Module["STACK_SIZE"] == "undefined",
      "STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time"
    );
    // If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
    assert(
      typeof Module["wasmMemory"] == "undefined",
      "Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally"
    );
    assert(
      typeof Module["INITIAL_MEMORY"] == "undefined",
      "Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically"
    );
  }

  // Begin runtime exports
  var missingLibrarySymbols = [
    "writeI53ToI64",
    "writeI53ToI64Clamped",
    "writeI53ToI64Signaling",
    "writeI53ToU64Clamped",
    "writeI53ToU64Signaling",
    "readI53FromI64",
    "readI53FromU64",
    "convertI32PairToI53",
    "convertI32PairToI53Checked",
    "convertU32PairToI53",
    "stackAlloc",
    "getTempRet0",
    "setTempRet0",
    "zeroMemory",
    "exitJS",
    "withStackSave",
    "strError",
    "inetPton4",
    "inetNtop4",
    "inetPton6",
    "inetNtop6",
    "readSockaddr",
    "writeSockaddr",
    "readEmAsmArgs",
    "jstoi_q",
    "autoResumeAudioContext",
    "getDynCaller",
    "dynCall",
    "handleException",
    "keepRuntimeAlive",
    "runtimeKeepalivePush",
    "runtimeKeepalivePop",
    "callUserCallback",
    "maybeExit",
    "asmjsMangle",
    "asyncLoad",
    "mmapAlloc",
    "HandleAllocator",
    "getNativeTypeSize",
    "getUniqueRunDependency",
    "addOnInit",
    "addOnPostCtor",
    "addOnPreMain",
    "addOnExit",
    "STACK_SIZE",
    "STACK_ALIGN",
    "POINTER_SIZE",
    "ASSERTIONS",
    "ccall",
    "cwrap",
    "convertJsFunctionToWasm",
    "getEmptyTableSlot",
    "updateTableMap",
    "getFunctionAddress",
    "addFunction",
    "removeFunction",
    "intArrayFromString",
    "intArrayToString",
    "AsciiToString",
    "stringToAscii",
    "UTF16ToString",
    "stringToUTF16",
    "lengthBytesUTF16",
    "UTF32ToString",
    "stringToUTF32",
    "lengthBytesUTF32",
    "stringToNewUTF8",
    "stringToUTF8OnStack",
    "writeArrayToMemory",
    "registerKeyEventCallback",
    "maybeCStringToJsString",
    "findEventTarget",
    "getBoundingClientRect",
    "fillMouseEventData",
    "registerMouseEventCallback",
    "registerWheelEventCallback",
    "registerUiEventCallback",
    "registerFocusEventCallback",
    "fillDeviceOrientationEventData",
    "registerDeviceOrientationEventCallback",
    "fillDeviceMotionEventData",
    "registerDeviceMotionEventCallback",
    "screenOrientation",
    "fillOrientationChangeEventData",
    "registerOrientationChangeEventCallback",
    "fillFullscreenChangeEventData",
    "registerFullscreenChangeEventCallback",
    "JSEvents_requestFullscreen",
    "JSEvents_resizeCanvasForFullscreen",
    "registerRestoreOldStyle",
    "hideEverythingExceptGivenElement",
    "restoreHiddenElements",
    "setLetterbox",
    "softFullscreenResizeWebGLRenderTarget",
    "doRequestFullscreen",
    "fillPointerlockChangeEventData",
    "registerPointerlockChangeEventCallback",
    "registerPointerlockErrorEventCallback",
    "requestPointerLock",
    "fillVisibilityChangeEventData",
    "registerVisibilityChangeEventCallback",
    "registerTouchEventCallback",
    "fillGamepadEventData",
    "registerGamepadEventCallback",
    "registerBeforeUnloadEventCallback",
    "fillBatteryEventData",
    "registerBatteryEventCallback",
    "setCanvasElementSize",
    "getCanvasElementSize",
    "jsStackTrace",
    "getCallstack",
    "convertPCtoSourceLocation",
    "wasiRightsToMuslOFlags",
    "wasiOFlagsToMuslOFlags",
    "initRandomFill",
    "randomFill",
    "safeSetTimeout",
    "setImmediateWrapped",
    "safeRequestAnimationFrame",
    "clearImmediateWrapped",
    "registerPostMainLoop",
    "registerPreMainLoop",
    "getPromise",
    "makePromise",
    "idsToPromises",
    "makePromiseCallback",
    "findMatchingCatch",
    "Browser_asyncPrepareDataCounter",
    "isLeapYear",
    "ydayFromDate",
    "arraySum",
    "addDays",
    "base64Decode",
    "getSocketFromFD",
    "getSocketAddress",
    "FS_createPreloadedFile",
    "FS_modeStringToFlags",
    "FS_getMode",
    "FS_stdin_getChar",
    "FS_mkdirTree",
    "_setNetworkCallback",
    "heapObjectForWebGLType",
    "toTypedArrayIndex",
    "webgl_enable_ANGLE_instanced_arrays",
    "webgl_enable_OES_vertex_array_object",
    "webgl_enable_WEBGL_draw_buffers",
    "webgl_enable_WEBGL_multi_draw",
    "webgl_enable_EXT_polygon_offset_clamp",
    "webgl_enable_EXT_clip_control",
    "webgl_enable_WEBGL_polygon_mode",
    "emscriptenWebGLGet",
    "computeUnpackAlignedImageSize",
    "colorChannelsInGlTextureFormat",
    "emscriptenWebGLGetTexPixelData",
    "emscriptenWebGLGetUniform",
    "webglGetUniformLocation",
    "webglPrepareUniformLocationsBeforeFirstUse",
    "webglGetLeftBracePos",
    "emscriptenWebGLGetVertexAttrib",
    "__glGetActiveAttribOrUniform",
    "writeGLArray",
    "registerWebGlEventCallback",
    "runAndAbortIfError",
    "ALLOC_NORMAL",
    "ALLOC_STACK",
    "allocate",
    "writeStringToMemory",
    "writeAsciiToMemory",
    "demangle",
    "stackTrace",
  ];
  missingLibrarySymbols.forEach(missingLibrarySymbol);

  var unexportedSymbols = [
    "run",
    "addRunDependency",
    "removeRunDependency",
    "out",
    "err",
    "callMain",
    "abort",
    "wasmMemory",
    "wasmExports",
    "HEAPF32",
    "HEAP8",
    "HEAPU8",
    "HEAP16",
    "HEAPU16",
    "HEAP64",
    "HEAPU64",
    "writeStackCookie",
    "checkStackCookie",
    "INT53_MAX",
    "INT53_MIN",
    "bigintToI53Checked",
    "stackSave",
    "stackRestore",
    "ptrToString",
    "getHeapMax",
    "growMemory",
    "ENV",
    "ERRNO_CODES",
    "DNS",
    "Protocols",
    "Sockets",
    "timers",
    "warnOnce",
    "readEmAsmArgsArray",
    "getExecutableName",
    "alignMemory",
    "wasmTable",
    "noExitRuntime",
    "addOnPreRun",
    "addOnPostRun",
    "freeTableIndexes",
    "functionsInTableMap",
    "setValue",
    "getValue",
    "PATH",
    "PATH_FS",
    "UTF8Decoder",
    "UTF8ArrayToString",
    "UTF8ToString",
    "stringToUTF8Array",
    "stringToUTF8",
    "lengthBytesUTF8",
    "UTF16Decoder",
    "JSEvents",
    "specialHTMLTargets",
    "findCanvasEventTarget",
    "currentFullscreenStrategy",
    "restoreOldWindowedStyle",
    "UNWIND_CACHE",
    "ExitStatus",
    "getEnvStrings",
    "checkWasiClock",
    "flush_NO_FILESYSTEM",
    "emSetImmediate",
    "emClearImmediate_deps",
    "emClearImmediate",
    "promiseMap",
    "uncaughtExceptionCount",
    "exceptionLast",
    "exceptionCaught",
    "ExceptionInfo",
    "Browser",
    "requestFullscreen",
    "requestFullScreen",
    "setCanvasSize",
    "getUserMedia",
    "createContext",
    "getPreloadedImageData__data",
    "wget",
    "MONTH_DAYS_REGULAR",
    "MONTH_DAYS_LEAP",
    "MONTH_DAYS_REGULAR_CUMULATIVE",
    "MONTH_DAYS_LEAP_CUMULATIVE",
    "SYSCALLS",
    "preloadPlugins",
    "FS_stdin_getChar_buffer",
    "FS_unlink",
    "FS_createPath",
    "FS_createDevice",
    "FS_readFile",
    "FS",
    "FS_root",
    "FS_mounts",
    "FS_devices",
    "FS_streams",
    "FS_nextInode",
    "FS_nameTable",
    "FS_currentPath",
    "FS_initialized",
    "FS_ignorePermissions",
    "FS_filesystems",
    "FS_syncFSRequests",
    "FS_readFiles",
    "FS_lookupPath",
    "FS_getPath",
    "FS_hashName",
    "FS_hashAddNode",
    "FS_hashRemoveNode",
    "FS_lookupNode",
    "FS_createNode",
    "FS_destroyNode",
    "FS_isRoot",
    "FS_isMountpoint",
    "FS_isFile",
    "FS_isDir",
    "FS_isLink",
    "FS_isChrdev",
    "FS_isBlkdev",
    "FS_isFIFO",
    "FS_isSocket",
    "FS_flagsToPermissionString",
    "FS_nodePermissions",
    "FS_mayLookup",
    "FS_mayCreate",
    "FS_mayDelete",
    "FS_mayOpen",
    "FS_checkOpExists",
    "FS_nextfd",
    "FS_getStreamChecked",
    "FS_getStream",
    "FS_createStream",
    "FS_closeStream",
    "FS_dupStream",
    "FS_doSetAttr",
    "FS_chrdev_stream_ops",
    "FS_major",
    "FS_minor",
    "FS_makedev",
    "FS_registerDevice",
    "FS_getDevice",
    "FS_getMounts",
    "FS_syncfs",
    "FS_mount",
    "FS_unmount",
    "FS_lookup",
    "FS_mknod",
    "FS_statfs",
    "FS_statfsStream",
    "FS_statfsNode",
    "FS_create",
    "FS_mkdir",
    "FS_mkdev",
    "FS_symlink",
    "FS_rename",
    "FS_rmdir",
    "FS_readdir",
    "FS_readlink",
    "FS_stat",
    "FS_fstat",
    "FS_lstat",
    "FS_doChmod",
    "FS_chmod",
    "FS_lchmod",
    "FS_fchmod",
    "FS_doChown",
    "FS_chown",
    "FS_lchown",
    "FS_fchown",
    "FS_doTruncate",
    "FS_truncate",
    "FS_ftruncate",
    "FS_utime",
    "FS_open",
    "FS_close",
    "FS_isClosed",
    "FS_llseek",
    "FS_read",
    "FS_write",
    "FS_mmap",
    "FS_msync",
    "FS_ioctl",
    "FS_writeFile",
    "FS_cwd",
    "FS_chdir",
    "FS_createDefaultDirectories",
    "FS_createDefaultDevices",
    "FS_createSpecialDirectories",
    "FS_createStandardStreams",
    "FS_staticInit",
    "FS_init",
    "FS_quit",
    "FS_findObject",
    "FS_analyzePath",
    "FS_createFile",
    "FS_createDataFile",
    "FS_forceLoadFile",
    "FS_createLazyFile",
    "FS_absolutePath",
    "FS_createFolder",
    "FS_createLink",
    "FS_joinPath",
    "FS_mmapAlloc",
    "FS_standardizePath",
    "MEMFS",
    "TTY",
    "PIPEFS",
    "SOCKFS",
    "tempFixedLengthArray",
    "miniTempWebGLFloatBuffers",
    "miniTempWebGLIntBuffers",
    "GL",
    "AL",
    "GLUT",
    "EGL",
    "GLEW",
    "IDBStore",
    "SDL",
    "SDL_gfx",
    "allocateUTF8",
    "allocateUTF8OnStack",
    "print",
    "printErr",
    "jstoi_s",
  ];
  unexportedSymbols.forEach(unexportedRuntimeSymbol);

  // End runtime exports
  // Begin JS library exports
  // End JS library exports

  // end include: postlibrary.js

  function checkIncomingModuleAPI() {
    ignoredModuleProp("fetchSettings");
  }

  // Imports from the Wasm binary.
  var _RunDsp2ctDenato = (Module["_RunDsp2ctDenato"] =
    makeInvalidEarlyAccess("_RunDsp2ctDenato"));
  var _RunDsp2ctRvmqs7 = (Module["_RunDsp2ctRvmqs7"] =
    makeInvalidEarlyAccess("_RunDsp2ctRvmqs7"));
  var _run_melt_generic = (Module["_run_melt_generic"] =
    makeInvalidEarlyAccess("_run_melt_generic"));
  var _RunDsp2ctExona = (Module["_RunDsp2ctExona"] =
    makeInvalidEarlyAccess("_RunDsp2ctExona"));
  var _RunDsp2ctRvmcfx = (Module["_RunDsp2ctRvmcfx"] =
    makeInvalidEarlyAccess("_RunDsp2ctRvmcfx"));
  var _RunDsp2ctSTST = (Module["_RunDsp2ctSTST"] =
    makeInvalidEarlyAccess("_RunDsp2ctSTST"));
  var _fflush = makeInvalidEarlyAccess("_fflush");
  var _strerror = makeInvalidEarlyAccess("_strerror");
  var _malloc = (Module["_malloc"] = makeInvalidEarlyAccess("_malloc"));
  var _free = (Module["_free"] = makeInvalidEarlyAccess("_free"));
  var _emscripten_stack_init = makeInvalidEarlyAccess("_emscripten_stack_init");
  var _emscripten_stack_get_free = makeInvalidEarlyAccess(
    "_emscripten_stack_get_free"
  );
  var _emscripten_stack_get_base = makeInvalidEarlyAccess(
    "_emscripten_stack_get_base"
  );
  var _emscripten_stack_get_end = makeInvalidEarlyAccess(
    "_emscripten_stack_get_end"
  );
  var __emscripten_stack_restore = makeInvalidEarlyAccess(
    "__emscripten_stack_restore"
  );
  var __emscripten_stack_alloc = makeInvalidEarlyAccess(
    "__emscripten_stack_alloc"
  );
  var _emscripten_stack_get_current = makeInvalidEarlyAccess(
    "_emscripten_stack_get_current"
  );

  function assignWasmExports(wasmExports) {
    Module["_RunDsp2ctDenato"] = _RunDsp2ctDenato = createExportWrapper(
      "RunDsp2ctDenato",
      9
    );
    Module["_RunDsp2ctRvmqs7"] = _RunDsp2ctRvmqs7 = createExportWrapper(
      "RunDsp2ctRvmqs7",
      9
    );
    Module["_run_melt_generic"] = _run_melt_generic = createExportWrapper(
      "run_melt_generic",
      17
    );
    Module["_RunDsp2ctExona"] = _RunDsp2ctExona = createExportWrapper(
      "RunDsp2ctExona",
      9
    );
    Module["_RunDsp2ctRvmcfx"] = _RunDsp2ctRvmcfx = createExportWrapper(
      "RunDsp2ctRvmcfx",
      9
    );
    Module["_RunDsp2ctSTST"] = _RunDsp2ctSTST = createExportWrapper(
      "RunDsp2ctSTST",
      9
    );
    _fflush = createExportWrapper("fflush", 1);
    _strerror = createExportWrapper("strerror", 1);
    Module["_malloc"] = _malloc = createExportWrapper("malloc", 1);
    Module["_free"] = _free = createExportWrapper("free", 1);
    _emscripten_stack_init = wasmExports["emscripten_stack_init"];
    _emscripten_stack_get_free = wasmExports["emscripten_stack_get_free"];
    _emscripten_stack_get_base = wasmExports["emscripten_stack_get_base"];
    _emscripten_stack_get_end = wasmExports["emscripten_stack_get_end"];
    __emscripten_stack_restore = wasmExports["_emscripten_stack_restore"];
    __emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"];
    _emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"];
  }
  var wasmImports = {
    /** @export */
    __cxa_throw: ___cxa_throw,
    /** @export */
    _abort_js: __abort_js,
    /** @export */
    _tzset_js: __tzset_js,
    /** @export */
    clock_time_get: _clock_time_get,
    /** @export */
    emscripten_resize_heap: _emscripten_resize_heap,
    /** @export */
    environ_get: _environ_get,
    /** @export */
    environ_sizes_get: _environ_sizes_get,
    /** @export */
    fd_close: _fd_close,
    /** @export */
    fd_seek: _fd_seek,
    /** @export */
    fd_write: _fd_write,
  };
  var wasmExports;
  createWasm();

  // include: postamble.js
  // === Auto-generated postamble setup entry stuff ===

  var calledRun;

  function stackCheckInit() {
    // This is normally called automatically during __wasm_call_ctors but need to
    // get these values before even running any of the ctors so we call it redundantly
    // here.
    _emscripten_stack_init();
    // TODO(sbc): Move writeStackCookie to native to to avoid this.
    writeStackCookie();
  }

  function run() {
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }

    stackCheckInit();

    preRun();

    // a preRun added a dependency, run will be called later
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }

    function doRun() {
      // run may have just been called through dependencies being fulfilled just in this very frame,
      // or while the async setStatus time below was happening
      assert(!calledRun);
      calledRun = true;
      Module["calledRun"] = true;

      if (ABORT) return;

      initRuntime();

      Module["onRuntimeInitialized"]?.();
      consumedModuleProp("onRuntimeInitialized");

      assert(
        !Module["_main"],
        'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]'
      );

      postRun();
    }

    if (Module["setStatus"]) {
      Module["setStatus"]("Running...");
      setTimeout(() => {
        setTimeout(() => Module["setStatus"](""), 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
    checkStackCookie();
  }

  function checkUnflushedContent() {
    // Compiler settings do not allow exiting the runtime, so flushing
    // the streams is not possible. but in ASSERTIONS mode we check
    // if there was something to flush, and if so tell the user they
    // should request that the runtime be exitable.
    // Normally we would not even include flush() at all, but in ASSERTIONS
    // builds we do so just for this check, and here we see if there is any
    // content to flush, that is, we check if there would have been
    // something a non-ASSERTIONS build would have not seen.
    // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
    // mode (which has its own special function for this; otherwise, all
    // the code is inside libc)
    var oldOut = out;
    var oldErr = err;
    var has = false;
    out = err = (x) => {
      has = true;
    };
    try {
      // it doesn't matter if it fails
      flush_NO_FILESYSTEM();
    } catch (e) {}
    out = oldOut;
    err = oldErr;
    if (has) {
      warnOnce(
        "stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc."
      );
      warnOnce(
        "(this may also be due to not including full filesystem support - try building with -sFORCE_FILESYSTEM)"
      );
    }
  }

  function preInit() {
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function")
        Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].shift()();
      }
    }
    consumedModuleProp("preInit");
  }

  preInit();
  run();
  return Module;
}

// end include: postamble.js

// include: /Users/luke/Luke_projects/dsp-v2.x-platformSW/jsWrapper/dsp_v2_x/generic/run_dsp_interface.js
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

const loadLib = () => {
  const m = initDsp2Module();
  if (m.onRuntimeInitialized) return m;
  return new Promise((resolve) => {
    m.onRuntimeInitialized = () => resolve(m);
  });
};

const dspMemAlloc = () => {
  // 데이터 타입별 바이트 크기를 상수로 정의합니다.
  const dataTypes = {
    F64: Module.HEAPF64.BYTES_PER_ELEMENT,
    I32: Module.HEAP32.BYTES_PER_ELEMENT,
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
      pointers[targetObjName][key] = Module._malloc(size * dataTypes[type]);
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
        Module._free(obj[key]);
      }
    }
  });
};

async function init() {
  Module = await loadLib();
}

async function terminate() {
  // Terminate logic
}

async function getVersion() {
  return "v2.2.1-beta.1";
}

const setRfuData = (rawDataLow, rawDataHigh) => {
  const bytesPerElementF64 = Module.HEAPF64.BYTES_PER_ELEMENT;

  const operations = [
    [rawDataLow, "rawDataLowPtr"],
    [rawDataHigh, "rawDataHighPtr"],
  ];

  for (const [sourceArray, pointerKey] of operations) {
    const destinationPointer = pointers.inputPointer[pointerKey];

    if (sourceArray && destinationPointer) {
      const offset = destinationPointer / bytesPerElementF64;
      Module.HEAPF64.set(sourceArray, offset);
    }
  }
};

const getMem = (numCycles, numTempers, numChannels) => {
  const dataTypes = {
    F64: { Ctor: Float64Array, buffer: Module.HEAPF64.buffer },
    I32: { Ctor: Int32Array, buffer: Module.HEAP32.buffer },
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
    const { Ctor, buffer } = dataTypes[type];
    const sourcePointerObj =
      pointerGroup === "base"
        ? pointers.dspBaseSubstPointer
        : pointers.dspPointer;

    const pointer = sourcePointerObj[ptrKey];
    if (pointer) {
      result[resultKey] = new Ctor(buffer, pointer, size).slice();
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
  const bufferPtr = Module._malloc(totalBytes);

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
      Module.HEAPF64[heapIndex + i] = flatSettingsArray[arrayBaseIndex + i];
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

/*
const props = {
      settingValues,
      lowRfu,
      highRfu,
    };
 */
async function main(props) {
  // Consumable index
  const csIndex = props.csIndex;
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

  // Raw Data per wells
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
  const resultsStructPtr = Module._malloc(numPointers * POINTER_SIZE);

  const baseIndex = resultsStructPtr / POINTER_SIZE;
  pointerOrder.forEach((pointerValue, index) => {
    Module.HEAPU32[baseIndex + index] = pointerValue;
  });

  Module._RunDsp2ctExona(
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
// end include: /Users/luke/Luke_projects/dsp-v2.x-platformSW/jsWrapper/dsp_v2_x/generic/run_dsp_interface.js
