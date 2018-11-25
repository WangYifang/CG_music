(function () {
    'use strict';

    const LAST_NUMBER_WEAK_MAP = new WeakMap();
    /*
     * The value of the constant Number.MAX_SAFE_INTEGER equals (2 ** 53 - 1) but it
     * is fairly new.
     */
    const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || 9007199254740991;
    const cache = (collection, nextNumber) => {
        LAST_NUMBER_WEAK_MAP.set(collection, nextNumber);
        return nextNumber;
    };
    const generateUniqueNumber = (collection) => {
        const lastNumber = LAST_NUMBER_WEAK_MAP.get(collection);
        /*
         * Let's try the cheapest algorithm first. It might fail to produce a new
         * number, but it is so cheap that it is okay to take the risk. Just
         * increase the last number by one or reset it to 0 if we reached the upper
         * bound of SMIs (which stands for small integers). When the last number is
         * unknown it is assumed that the collection contains zero based consecutive
         * numbers.
         */
        let nextNumber = (lastNumber === undefined) ?
            collection.size :
            (lastNumber > 2147483648) ?
                0 :
                lastNumber + 1;
        if (!collection.has(nextNumber)) {
            return cache(collection, nextNumber);
        }
        /*
         * If there are less than half of 2 ** 31 numbers stored in the collection,
         * the chance to generate a new random number in the range from 0 to 2 ** 31
         * is at least 50%. It's benifitial to use only SMIs because they perform
         * much better in any environment based on V8.
         */
        if (collection.size < 1073741824) {
            while (collection.has(nextNumber)) {
                nextNumber = Math.floor(Math.random() * 2147483648);
            }
            return cache(collection, nextNumber);
        }
        // Quickly check if there is a theoretical chance to generate a new number.
        if (collection.size > MAX_SAFE_INTEGER) {
            throw new Error('Congratulations, you created a collection of unique numbers which uses all available integers!');
        }
        // Otherwise use the full scale of safely usable integers.
        while (collection.has(nextNumber)) {
            nextNumber = Math.floor(Math.random() * MAX_SAFE_INTEGER);
        }
        return cache(collection, nextNumber);
    };

    const addUniqueNumber = (set) => {
        const number = generateUniqueNumber(set);
        set.add(number);
        return number;
    };

    const isMessagePort = (sender) => {
        return (typeof sender.start === 'function');
    };

    const PORT_MAP = new WeakMap();

    const extendBrokerImplementation = (partialBrokerImplementation) => {
        return Object.assign({}, partialBrokerImplementation, { connect: ({ call }) => {
                return async () => {
                    const { port1, port2 } = new MessageChannel();
                    const portId = await call('connect', { port: port1 }, [port1]);
                    PORT_MAP.set(port2, portId);
                    return port2;
                };
            }, disconnect: ({ call }) => {
                return async (port) => {
                    const portId = PORT_MAP.get(port);
                    if (portId === undefined) {
                        throw new Error('The given port is not connected.');
                    }
                    await call('disconnect', { portId });
                };
            }, isSupported: ({ call }) => {
                return () => call('isSupported');
            } });
    };

    const ONGOING_REQUESTS = new WeakMap();
    const createOrGetOngoingRequests = (sender) => {
        if (ONGOING_REQUESTS.has(sender)) {
            // @todo TypeScript needs to be convinced that has() works as expected.
            return ONGOING_REQUESTS.get(sender);
        }
        const ongoingRequests = new Map();
        ONGOING_REQUESTS.set(sender, ongoingRequests);
        return ongoingRequests;
    };
    const createBroker = (brokerImplementation) => {
        const fullBrokerImplementation = extendBrokerImplementation(brokerImplementation);
        return (sender) => {
            const ongoingRequests = createOrGetOngoingRequests(sender);
            sender.addEventListener('message', (({ data: message }) => {
                const { id } = message;
                if (id !== null && ongoingRequests.has(id)) {
                    const { reject, resolve } = ongoingRequests.get(id);
                    ongoingRequests.delete(id);
                    if (message.error === undefined) {
                        resolve(message.result);
                    }
                    else {
                        reject(new Error(message.error.message));
                    }
                }
            }));
            if (isMessagePort(sender)) {
                sender.start();
            }
            const call = (method, params = null, transferables = []) => {
                return new Promise((resolve, reject) => {
                    const id = generateUniqueNumber(ongoingRequests);
                    ongoingRequests.set(id, { reject, resolve });
                    if (params === null) {
                        sender.postMessage({ id, method }, transferables);
                    }
                    else {
                        sender.postMessage({ id, method, params }, transferables);
                    }
                });
            };
            const notify = (method, params, transferables = []) => {
                sender.postMessage({ id: null, method, params }, transferables);
            };
            let functions = {};
            for (const [key, handler] of Object.entries(fullBrokerImplementation)) {
                functions = Object.assign({}, functions, { [key]: handler({ call, notify }) });
            }
            return Object.assign({}, functions);
        };
    };

    const wrap = createBroker({
        allocate: ({ call }) => {
            return async (length) => {
                return call('allocate', { length });
            };
        },
        deallocate: ({ notify }) => {
            return (arrayBuffer) => {
                notify('deallocate', { arrayBuffer }, [arrayBuffer]);
            };
        }
    });
    const load = (url) => {
        const worker = new Worker(url);
        return wrap(worker);
    };

    // tslint:disable-next-line:max-line-length
    const worker = `!function(e){var t={};function r(n){if(t[n])return t[n].exports;var o=t[n]={i:n,l:!1,exports:{}};return e[n].call(o.exports,o,o.exports,r),o.l=!0,o.exports}r.m=e,r.c=t,r.d=function(e,t,n){r.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:n})},r.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},r.t=function(e,t){if(1&t&&(e=r(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var n=Object.create(null);if(r.r(n),Object.defineProperty(n,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var o in e)r.d(n,o,function(t){return e[t]}.bind(null,o));return n},r.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return r.d(t,"a",t),t},r.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},r.p="",r(r.s=8)}([function(e,t,r){!function(e,t,r,n){"use strict";t=t&&t.hasOwnProperty("default")?t.default:t,r=r&&r.hasOwnProperty("default")?r.default:r,n=n&&n.hasOwnProperty("default")?n.default:n;var o=function(e,t){return void 0===t?e:t.reduce(function(e,t){if("capitalize"===t){var o=e.charAt(0).toUpperCase(),a=e.slice(1);return"".concat(o).concat(a)}return"dashify"===t?r(e):"prependIndefiniteArticle"===t?"".concat(n(e)," ").concat(e):e},e)},a=function(e,r){for(var n=/\\\${([^.}]+)((\\.[^(]+\\(\\))*)}/g,a=[],i=n.exec(e);null!==i;){var s={modifiers:[],name:i[1]};if(void 0!==i[3])for(var u=/\\.[^(]+\\(\\)/g,c=u.exec(i[2]);null!==c;)s.modifiers.push(c[0].slice(1,-2)),c=u.exec(i[2]);a.push(s),i=n.exec(e)}var d=a.reduce(function(e,n){return e.map(function(e){return"string"==typeof e?e.split(function(e){var t=e.name+e.modifiers.map(function(e){return"\\\\.".concat(e,"\\\\(\\\\)")}).join("");return new RegExp("\\\\$\\\\{".concat(t,"}"),"g")}(n)).reduce(function(e,a,i){return 0===i?[a]:n.name in r?t(e).concat([o(r[n.name],n.modifiers),a]):t(e).concat([function(e){return o(e[n.name],n.modifiers)},a])},[]):[e]}).reduce(function(e,r){return t(e).concat(t(r))},[])},[e]);return function(e){return d.reduce(function(r,n){return"string"==typeof n?t(r).concat([n]):t(r).concat([n(e)])},[]).join("")}};e.compile=function(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},r=void 0===e.code?void 0:a(e.code,t),n=void 0===e.message?void 0:a(e.message,t);return function(){var t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},o=arguments.length>1?arguments[1]:void 0,a=void 0===o&&(t instanceof Error||void 0!==t.code&&"Exception"===t.code.slice(-9))?{cause:t,missingParameters:{}}:{cause:o,missingParameters:t},i=a.cause,s=a.missingParameters,u=void 0===n?new Error:new Error(n(s));return null!==i&&(u.cause=i),void 0!==r&&(u.code=r(s)),void 0!==e.status&&(u.status=e.status),u}},Object.defineProperty(e,"__esModule",{value:!0})}(t,r(2),r(6),r(7))},function(e,t,r){!function(e){"use strict";var t=new WeakMap,r=Number.MAX_SAFE_INTEGER||9007199254740991,n=function(e,r){return t.set(e,r),r},o=function(e){var o=t.get(e),a=void 0===o?e.size:o>2147483648?0:o+1;if(!e.has(a))return n(e,a);if(e.size<1073741824){for(;e.has(a);)a=Math.floor(2147483648*Math.random());return n(e,a)}if(e.size>r)throw new Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;e.has(a);)a=Math.floor(Math.random()*r);return n(e,a)};e.addUniqueNumber=function(e){var t=o(e);return e.add(t),t},e.generateUniqueNumber=o,Object.defineProperty(e,"__esModule",{value:!0})}(t)},function(e,t,r){var n=r(3),o=r(4),a=r(5);e.exports=function(e){return n(e)||o(e)||a()}},function(e,t){e.exports=function(e){if(Array.isArray(e)){for(var t=0,r=new Array(e.length);t<e.length;t++)r[t]=e[t];return r}}},function(e,t){e.exports=function(e){if(Symbol.iterator in Object(e)||"[object Arguments]"===Object.prototype.toString.call(e))return Array.from(e)}},function(e,t){e.exports=function(){throw new TypeError("Invalid attempt to spread non-iterable instance")}},function(e,t,r){"use strict";e.exports=((e,t)=>{if("string"!=typeof e)throw new TypeError("expected a string");return e.trim().replace(/([a-z])([A-Z])/g,"$1-$2").replace(/\\W/g,e=>/[À-ž]/.test(e)?e:"-").replace(/^-+|-+$/g,"").replace(/-{2,}/g,e=>t&&t.condense?"-":e).toLowerCase()})},function(e,t,r){var n=function(e){var t,r,n=/\\w+/.exec(e);if(!n)return"an";var o=(r=n[0]).toLowerCase(),a=["honest","hour","hono"];for(t in a)if(0==o.indexOf(a[t]))return"an";if(1==o.length)return"aedhilmnorsx".indexOf(o)>=0?"an":"a";if(r.match(/(?!FJO|[HLMNS]Y.|RY[EO]|SQU|(F[LR]?|[HL]|MN?|N|RH?|S[CHKLMNPTVW]?|X(YL)?)[AEIOU])[FHLMNRSX][A-Z]/))return"an";var i=[/^e[uw]/,/^onc?e\\b/,/^uni([^nmd]|mo)/,/^u[bcfhjkqrst][aeiou]/];for(t=0;t<i.length;t++)if(o.match(i[t]))return"a";return r.match(/^U[NK][AIEO]/)?"a":r==r.toUpperCase()?"aedhilmnorsx".indexOf(o[0])>=0?"an":"a":"aeiou".indexOf(o[0])>=0?"an":o.match(/^y(b[lor]|cl[ea]|fere|gg|p[ios]|rou|tt)/)?"an":"a"};void 0!==e.exports?e.exports=n:window.indefiniteArticle=n},function(e,t,r){"use strict";r.r(t);var n=r(0);const o=-32603,a=-32602,i=-32601,s=Object(n.compile)({message:'The requested method called "\${method}" is not supported.',status:i}),u=Object(n.compile)({message:'The handler of the method called "\${method}" returned no required result.',status:o}),c=Object(n.compile)({message:'The handler of the method called "\${method}" returned an unexpected result.',status:o}),d=Object(n.compile)({message:'The specified parameter called "portId" with the given value "\${portId}" does not identify a port connected to this worker.',status:a});var f=r(1);const l=new Map,p=(e,t,r)=>Object.assign({},t,{connect:r=>{let n=r.port;n.start();const o=e(n,t),a=Object(f.generateUniqueNumber)(l);return l.set(a,()=>{o(),n.close(),l.delete(a)}),{result:a}},disconnect:e=>{let t=e.portId;const r=l.get(t);if(void 0===r)throw d({portId:t.toString()});return r(),{result:null}},isSupported:async()=>{if(await(()=>new Promise(e=>{const t=new ArrayBuffer(0),r=new MessageChannel,n=r.port1,o=r.port2;n.onmessage=(t=>{let r=t.data;return e(null!==r)}),o.postMessage(t,[t])}))()){const e=r();return{result:e instanceof Promise?await e:e}}return{result:!1}}});!function e(t,r){let n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:()=>!0;const o=p(e,r,n),a=((e,t)=>async r=>{let n=r.data,o=n.id,a=n.method,i=n.params;const d=t[a];try{if(void 0===d)throw s({method:a});const t=void 0===i?d():d(i);if(void 0===t)throw u({method:a});const r=t instanceof Promise?await t:t;if(null===o){if(void 0!==r.result)throw c({method:a})}else{if(void 0===r.result)throw c({method:a});const t=r.result,n=r.transferables,i=void 0===n?[]:n;e.postMessage({id:o,result:t},i)}}catch(t){const r=t.message,n=t.status,a=void 0===n?-32603:n;e.postMessage({error:{code:a,message:r},id:o})}})(t,o);return t.addEventListener("message",a),()=>t.removeEventListener("message",a)}(self,{allocate:e=>{const t=(e=>new ArrayBuffer(e))(e.length);return{result:t,transferables:[t]}},deallocate:()=>({result:void 0})})}]);`;

    const blob = new Blob([worker], { type: 'application/javascript; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const asyncArrayBuffer = load(url);
    const allocate = asyncArrayBuffer.allocate;
    const connect = asyncArrayBuffer.connect;
    const deallocate = asyncArrayBuffer.deallocate;
    const disconnect = asyncArrayBuffer.disconnect;
    const isSupported = asyncArrayBuffer.isSupported;
    URL.revokeObjectURL(url);

    /*!
     * modernizr v3.6.0
     * Build https://modernizr.com/download?-promises-typedarrays-webaudio-dontmin
     *
     * Copyright (c)
     *  Faruk Ates
     *  Paul Irish
     *  Alex Sexton
     *  Ryan Seddon
     *  Patrick Kettner
     *  Stu Cox
     *  Richard Herrera

     * MIT License
     */
    (function (window) {
        var tests = [];
        /**
         *
         * ModernizrProto is the constructor for Modernizr
         *
         * @class
         * @access public
         */
        var ModernizrProto = {
            // The current version, dummy
            _version: '3.6.0',
            // Any settings that don't work as separate modules
            // can go in here as configuration.
            _config: {
                'classPrefix': '',
                'enableClasses': true,
                'enableJSClass': true,
                'usePrefixes': true
            },
            // Queue of tests
            _q: [],
            // Stub these for people who are listening
            on: function (test, cb) {
                // I don't really think people should do this, but we can
                // safe guard it a bit.
                // -- NOTE:: this gets WAY overridden in src/addTest for actual async tests.
                // This is in case people listen to synchronous tests. I would leave it out,
                // but the code to *disallow* sync tests in the real version of this
                // function is actually larger than this.
                var self = this;
                setTimeout(function () {
                    cb(self[test]);
                }, 0);
            },
            addTest: function (name, fn, options) {
                tests.push({ name: name, fn: fn, options: options });
            },
            addAsyncTest: function (fn) {
                tests.push({ name: null, fn: fn });
            }
        };
        // Fake some of Object.create so we can force non test results to be non "own" properties.
        var Modernizr = function () { };
        Modernizr.prototype = ModernizrProto;
        // Leak modernizr globally when you `require` it rather than force it here.
        // Overwrite name so constructor name is nicer :D
        Modernizr = new Modernizr();
        var classes = [];
        /**
         * is returns a boolean if the typeof an obj is exactly type.
         *
         * @access private
         * @function is
         * @param {*} obj - A thing we want to check the type of
         * @param {string} type - A string to compare the typeof against
         * @returns {boolean}
         */
        function is(obj, type) {
            return typeof obj === type;
        }
        /**
         * Run through all tests and detect their support in the current UA.
         *
         * @access private
         */
        function testRunner() {
            var featureNames;
            var feature;
            var aliasIdx;
            var result;
            var nameIdx;
            var featureName;
            var featureNameSplit;
            for (var featureIdx in tests) {
                if (tests.hasOwnProperty(featureIdx)) {
                    featureNames = [];
                    feature = tests[featureIdx];
                    // run the test, throw the return value into the Modernizr,
                    // then based on that boolean, define an appropriate className
                    // and push it into an array of classes we'll join later.
                    //
                    // If there is no name, it's an 'async' test that is run,
                    // but not directly added to the object. That should
                    // be done with a post-run addTest call.
                    if (feature.name) {
                        featureNames.push(feature.name.toLowerCase());
                        if (feature.options && feature.options.aliases && feature.options.aliases.length) {
                            // Add all the aliases into the names list
                            for (aliasIdx = 0; aliasIdx < feature.options.aliases.length; aliasIdx++) {
                                featureNames.push(feature.options.aliases[aliasIdx].toLowerCase());
                            }
                        }
                    }
                    // Run the test, or use the raw value if it's not a function
                    result = is(feature.fn, 'function') ? feature.fn() : feature.fn;
                    // Set each of the names on the Modernizr object
                    for (nameIdx = 0; nameIdx < featureNames.length; nameIdx++) {
                        featureName = featureNames[nameIdx];
                        // Support dot properties as sub tests. We don't do checking to make sure
                        // that the implied parent tests have been added. You must call them in
                        // order (either in the test, or make the parent test a dependency).
                        //
                        // Cap it to TWO to make the logic simple and because who needs that kind of subtesting
                        // hashtag famous last words
                        featureNameSplit = featureName.split('.');
                        if (featureNameSplit.length === 1) {
                            Modernizr[featureNameSplit[0]] = result;
                        }
                        else {
                            // cast to a Boolean, if not one already
                            if (Modernizr[featureNameSplit[0]] && !(Modernizr[featureNameSplit[0]] instanceof Boolean)) {
                                Modernizr[featureNameSplit[0]] = new Boolean(Modernizr[featureNameSplit[0]]);
                            }
                            Modernizr[featureNameSplit[0]][featureNameSplit[1]] = result;
                        }
                        classes.push((result ? '' : 'no-') + featureNameSplit.join('-'));
                    }
                }
            }
        }
        /*!
        {
          "name": "ES6 Promises",
          "property": "promises",
          "caniuse": "promises",
          "polyfills": ["es6promises"],
          "authors": ["Krister Kari", "Jake Archibald"],
          "tags": ["es6"],
          "notes": [{
            "name": "The ES6 promises spec",
            "href": "https://github.com/domenic/promises-unwrapping"
          },{
            "name": "Chromium dashboard - ES6 Promises",
            "href": "https://www.chromestatus.com/features/5681726336532480"
          },{
            "name": "JavaScript Promises: There and back again - HTML5 Rocks",
            "href": "http://www.html5rocks.com/en/tutorials/es6/promises/"
          }]
        }
        !*/
        /* DOC
        Check if browser implements ECMAScript 6 Promises per specification.
        */
        Modernizr.addTest('promises', function () {
            return 'Promise' in window &&
                // Some of these methods are missing from
                // Firefox/Chrome experimental implementations
                'resolve' in window.Promise &&
                'reject' in window.Promise &&
                'all' in window.Promise &&
                'race' in window.Promise &&
                // Older version of the spec had a resolver object
                // as the arg rather than a function
                (function () {
                    var resolve;
                    new window.Promise(function (r) { resolve = r; });
                    return typeof resolve === 'function';
                }());
        });
        /*!
        {
          "name": "Typed arrays",
          "property": "typedarrays",
          "caniuse": "typedarrays",
          "tags": ["js"],
          "authors": ["Stanley Stuart (@fivetanley)"],
          "notes": [{
            "name": "MDN documentation",
            "href": "https://developer.mozilla.org/en-US/docs/JavaScript_typed_arrays"
          },{
            "name": "Kronos spec",
            "href": "https://www.khronos.org/registry/typedarray/specs/latest/"
          }],
          "polyfills": ["joshuabell-polyfill"]
        }
        !*/
        /* DOC
        Detects support for native binary data manipulation via Typed Arrays in JavaScript.
        
        Does not check for DataView support; use `Modernizr.dataview` for that.
        */
        // Should fail in:
        // Internet Explorer <= 9
        // Firefox <= 3.6
        // Chrome <= 6.0
        // iOS Safari < 4.2
        // Safari < 5.1
        // Opera < 11.6
        // Opera Mini, <= 7.0
        // Android Browser < 4.0
        // Blackberry Browser < 10.0
        Modernizr.addTest('typedarrays', 'ArrayBuffer' in window);
        /*!
        {
          "name": "Web Audio API",
          "property": "webaudio",
          "caniuse": "audio-api",
          "polyfills": ["xaudiojs", "dynamicaudiojs", "audiolibjs"],
          "tags": ["audio", "media"],
          "builderAliases": ["audio_webaudio_api"],
          "authors": ["Addy Osmani"],
          "notes": [{
            "name": "W3 Specification",
            "href": "https://dvcs.w3.org/hg/audio/raw-file/tip/webaudio/specification.html"
          }]
        }
        !*/
        /* DOC
        Detects the older non standard webaudio API, (as opposed to the standards based AudioContext API)
        */
        Modernizr.addTest('webaudio', function () {
            var prefixed = 'webkitAudioContext' in window;
            var unprefixed = 'AudioContext' in window;
            if (Modernizr._config.usePrefixes) {
                return prefixed || unprefixed;
            }
            return unprefixed;
        });
        // Run each test
        testRunner();
        delete ModernizrProto.addTest;
        delete ModernizrProto.addAsyncTest;
        // Run the things that are supposed to run after the tests
        for (var i = 0; i < Modernizr._q.length; i++) {
            Modernizr._q[i]();
        }
        // Leak Modernizr namespace
        return Modernizr;
    })(window);

    const createAbortError = () => {
        try {
            return new DOMException('', 'AbortError');
        }
        catch (err) {
            err.code = 20;
            err.name = 'AbortError';
            return err;
        }
    };

    const AUDIO_NODE_STORE = new WeakMap();
    const AUDIO_GRAPHS = new WeakMap();
    const AUDIO_PARAM_STORE = new WeakMap();
    const BACKUP_NATIVE_CONTEXT_STORE = new WeakMap();
    const CONTEXT_STORE = new WeakMap();
    const DETACHED_ARRAY_BUFFERS = new WeakSet();
    // This clunky name is borrowed from the spec. :-)
    const NODE_NAME_TO_PROCESSOR_DEFINITION_MAPS = new WeakMap();
    const TEST_RESULTS = new WeakMap();

    const evaluateSource = (source) => {
        return new Promise((resolve, reject) => {
            const head = document.head;
            if (head === null) {
                reject(new SyntaxError());
            }
            else {
                const script = document.createElement('script');
                // @todo Safari doesn't like URLs with a type of 'application/javascript; charset=utf-8'.
                const blob = new Blob([source], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);
                const originalOnErrorHandler = window.onerror;
                const removeErrorEventListenerAndRevokeUrl = () => {
                    window.onerror = originalOnErrorHandler;
                    URL.revokeObjectURL(url);
                };
                window.onerror = (message, src, lineno, colno, error) => {
                    // @todo Edge thinks the source is the one of the html document.
                    if (src === url || (src === location.href && lineno === 1 && colno === 1)) {
                        removeErrorEventListenerAndRevokeUrl();
                        reject(error);
                        return false;
                    }
                    if (originalOnErrorHandler !== null) {
                        return originalOnErrorHandler(message, src, lineno, colno, error);
                    }
                };
                script.onerror = () => {
                    removeErrorEventListenerAndRevokeUrl();
                    reject(new SyntaxError());
                };
                script.onload = () => {
                    removeErrorEventListenerAndRevokeUrl();
                    resolve();
                };
                script.src = url;
                script.type = 'module';
                head.appendChild(script);
            }
        });
    };

    const createInvalidStateError = () => {
        try {
            return new DOMException('', 'InvalidStateError');
        }
        catch (err) {
            err.code = 11;
            err.name = 'InvalidStateError';
            return err;
        }
    };

    const getNativeContext = (context) => {
        const nativeContext = CONTEXT_STORE.get(context);
        if (nativeContext === undefined) {
            throw createInvalidStateError();
        }
        return nativeContext;
    };

    const handler = {
        construct() {
            return handler;
        }
    };
    const isConstructible = (constructible) => {
        try {
            const proxy = new Proxy(constructible, handler);
            new proxy(); // tslint:disable-line:no-unused-expression
        }
        catch (_a) {
            return false;
        }
        return true;
    };

    /*
     * This massive regex tries to cover all the following cases.
     *
     * import './path';
     * import defaultImport from './path';
     * import { namedImport } from './path';
     * import { namedImport as renamendImport } from './path';
     * import * as namespaceImport from './path';
     * import defaultImport, { namedImport } from './path';
     * import defaultImport, { namedImport as renamendImport } from './path';
     * import defaultImport, * as namespaceImport from './path';
     */
    const IMPORT_STATEMENT_REGEX = /^import(?:(?:[\s]+[\w]+|(?:[\s]+[\w]+[\s]*,)?[\s]*\{[\s]*[\w]+(?:[\s]+as[\s]+[\w]+)?(?:[\s]*,[\s]*[\w]+(?:[\s]+as[\s]+[\w]+)?)*[\s]*}|(?:[\s]+[\w]+[\s]*,)?[\s]*\*[\s]+as[\s]+[\w]+)[\s]+from)?(?:[\s]*)("([^"\\]|\\.)+"|'([^'\\]|\\.)+')(?:[\s]*);?/; // tslint:disable-line:max-line-length
    const splitImportStatements = (source, url) => {
        const importStatements = [];
        let sourceWithoutImportStatements = source.replace(/^[\s]+/, '');
        let result = sourceWithoutImportStatements.match(IMPORT_STATEMENT_REGEX);
        while (result !== null) {
            const unresolvedUrl = result[1].slice(1, -1);
            const importStatementWithResolvedUrl = result[0]
                .replace(/([\s]+)?;?$/, '')
                .replace(unresolvedUrl, (new URL(unresolvedUrl, url)).toString());
            importStatements.push(importStatementWithResolvedUrl);
            sourceWithoutImportStatements = sourceWithoutImportStatements
                .slice(result[0].length)
                .replace(/^[\s]+/, '');
            result = sourceWithoutImportStatements.match(IMPORT_STATEMENT_REGEX);
        }
        return [importStatements.join(';'), sourceWithoutImportStatements];
    };

    const verifyParameterDescriptors = (parameterDescriptors) => {
        if (parameterDescriptors !== undefined && !Array.isArray(parameterDescriptors)) {
            throw new TypeError('The parameterDescriptors property of given value for processorCtor is not an array.');
        }
    };
    const verifyProcessorCtor = (processorCtor) => {
        if (!isConstructible(processorCtor)) {
            throw new TypeError('The given value for processorCtor should be a constructor.');
        }
        if (processorCtor.prototype === null || typeof processorCtor.prototype !== 'object') {
            throw new TypeError('The given value for processorCtor should have a prototype.');
        }
        if (typeof processorCtor.prototype.process !== 'function') {
            throw new TypeError('The given value for processorCtor should have a callable process() function.');
        }
    };
    const ongoingRequests = new WeakMap();
    const resolvedRequests = new WeakMap();
    const createAddAudioWorkletModule = (createAbortError, createNotSupportedError, fetchSource, getBackupNativeContext) => {
        return (context, moduleURL, options = { credentials: 'omit' }) => {
            const nativeContext = getNativeContext(context);
            const absoluteUrl = (new URL(moduleURL, location.href)).toString();
            // Bug #59: Only Chrome & Opera do implement the audioWorklet property.
            if (nativeContext.audioWorklet !== undefined) {
                return fetchSource(moduleURL)
                    .then((source) => {
                    const [importStatements, sourceWithoutImportStatements] = splitImportStatements(source, absoluteUrl);
                    /*
                     * Bug #86: Chrome Canary does not invoke the process() function if the corresponding AudioWorkletNode has no output.
                     *
                     * This is the unminified version of the code used below:
                     *
                     * ```js
                     * `${ importStatements };
                     * ((registerProcessor) => {${ sourceWithoutImportStatements }
                     * })((name, processorCtor) => registerProcessor(name, class extends processorCtor {
                     *
                     *     constructor (options) {
                     *         const { hasNoOutput, ...otherParameterData } = options.parameterData;
                     *
                     *         if (hasNoOutput === 1) {
                     *             super({ ...options, numberOfOutputs: 0, outputChannelCount: [ ], parameterData: otherParameterData });
                     *
                     *             this._hasNoOutput = true;
                     *         } else {
                     *             super(options);
                     *
                     *             this._hasNoOutput = false;
                     *         }
                     *     }
                     *
                     *     process (inputs, outputs, parameters) {
                     *         return super.process(inputs, (this._hasNoOutput) ? [ ] : outputs, parameters);
                     *     }
                     *
                     * }))`
                     * ```
                     */
                    const wrappedSource = `${importStatements};(registerProcessor=>{${sourceWithoutImportStatements}
})((n,p)=>registerProcessor(n,class extends p{constructor(o){const{hasNoOutput,...q}=o.parameterData;if(hasNoOutput===1){super({...o,numberOfOutputs:0,outputChannelCount:[],parameterData:q});this._h=true}else{super(o);this._h=false}}process(i,o,p){return super.process(i,(this._h)?[]:o,p)}}))`; // tslint:disable-line:max-line-length
                    const blob = new Blob([wrappedSource], { type: 'application/javascript; charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const backupNativeContext = getBackupNativeContext(nativeContext);
                    const nativeContextOrBackupNativeContext = (backupNativeContext !== null) ? backupNativeContext : nativeContext;
                    return nativeContextOrBackupNativeContext.audioWorklet
                        .addModule(url, options)
                        .then(() => URL.revokeObjectURL(url))
                        // @todo This could be written more elegantly when Promise.finally() becomes avalaible.
                        .catch((err) => {
                        URL.revokeObjectURL(url);
                        throw err; // tslint:disable-line:rxjs-throw-error
                    });
                });
            }
            else {
                const resolvedRequestsOfContext = resolvedRequests.get(context);
                if (resolvedRequestsOfContext !== undefined && resolvedRequestsOfContext.has(moduleURL)) {
                    return Promise.resolve();
                }
                const ongoingRequestsOfContext = ongoingRequests.get(context);
                if (ongoingRequestsOfContext !== undefined) {
                    const promiseOfOngoingRequest = ongoingRequestsOfContext.get(moduleURL);
                    if (promiseOfOngoingRequest !== undefined) {
                        return promiseOfOngoingRequest;
                    }
                }
                const promise = fetchSource(moduleURL)
                    .then((source) => {
                    const [importStatements, sourceWithoutImportStatements] = splitImportStatements(source, absoluteUrl);
                    /*
                     * This is the unminified version of the code used below:
                     *
                     * ```js
                     * ${ importStatements };
                     * ((a, b) => {
                     *     (a[b] = a[b] || [ ]).push(
                     *         (AudioWorkletProcessor, currentFrame, currentTime, global, egisterProcessor, sampleRate, self, window) => {
                     *             ${ sourceWithoutImportStatements }
                     *         }
                     *     );
                     * })(window, '_AWGS');
                     * ```
                     */
                    // tslint:disable-next-line:max-line-length
                    const wrappedSource = `${importStatements};((a,b)=>{(a[b]=a[b]||[]).push((AudioWorkletProcessor,currentFrame,currentTime,global,registerProcessor,sampleRate,self,window)=>{${sourceWithoutImportStatements}
})})(window,'_AWGS')`;
                    // @todo Evaluating the given source code is a possible security problem.
                    return evaluateSource(wrappedSource);
                })
                    .then(() => {
                    const globalScope = Object.create(null, {
                        currentFrame: {
                            get: () => {
                                return nativeContext.currentTime * nativeContext.sampleRate;
                            }
                        },
                        currentTime: {
                            get: () => {
                                return nativeContext.currentTime;
                            }
                        },
                        sampleRate: {
                            get: () => {
                                return nativeContext.sampleRate;
                            }
                        }
                    });
                    const evaluateAudioWorkletGlobalScope = window._AWGS.pop();
                    if (evaluateAudioWorkletGlobalScope === undefined) {
                        throw new SyntaxError();
                    }
                    evaluateAudioWorkletGlobalScope(class AudioWorkletProcessor {
                    }, globalScope.currentFrame, globalScope.currentTime, undefined, (name, processorCtor) => {
                        if (name.trim() === '') {
                            throw createNotSupportedError();
                        }
                        const nodeNameToProcessorDefinitionMap = NODE_NAME_TO_PROCESSOR_DEFINITION_MAPS.get(nativeContext);
                        if (nodeNameToProcessorDefinitionMap !== undefined) {
                            if (nodeNameToProcessorDefinitionMap.has(name)) {
                                throw createNotSupportedError();
                            }
                            verifyProcessorCtor(processorCtor);
                            verifyParameterDescriptors(processorCtor.parameterDescriptors);
                            nodeNameToProcessorDefinitionMap.set(name, processorCtor);
                        }
                        else {
                            verifyProcessorCtor(processorCtor);
                            verifyParameterDescriptors(processorCtor.parameterDescriptors);
                            NODE_NAME_TO_PROCESSOR_DEFINITION_MAPS.set(nativeContext, new Map([[name, processorCtor]]));
                        }
                    }, globalScope.sampleRate, undefined, undefined);
                })
                    .catch((err) => {
                    if (err.name === 'SyntaxError') {
                        throw createAbortError();
                    }
                    throw err; // tslint:disable-line:rxjs-throw-error
                });
                if (ongoingRequestsOfContext === undefined) {
                    ongoingRequests.set(context, new Map([[moduleURL, promise]]));
                }
                else {
                    ongoingRequestsOfContext.set(moduleURL, promise);
                }
                promise
                    .then(() => {
                    const rslvdRqstsFCntxt = resolvedRequests.get(context);
                    if (rslvdRqstsFCntxt === undefined) {
                        resolvedRequests.set(context, new Set([moduleURL]));
                    }
                    else {
                        rslvdRqstsFCntxt.add(moduleURL);
                    }
                })
                    .catch(() => { }) // tslint:disable-line:no-empty
                    // @todo Use finally when it becomes available in all supported browsers.
                    .then(() => {
                    const ngngRqstsFCntxt = ongoingRequests.get(context);
                    if (ngngRqstsFCntxt !== undefined) {
                        ngngRqstsFCntxt.delete(moduleURL);
                    }
                });
                return promise;
            }
        };
    };

    const DEFAULT_OPTIONS = {
        channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers',
        fftSize: 2048,
        maxDecibels: -30,
        minDecibels: -100,
        smoothingTimeConstant: 0.8
    };
    const createAnalyserNodeConstructor = (createAnalyserNodeRenderer, createNativeAnalyserNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class AnalyserNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS, options);
                const nativeAnalyserNode = createNativeAnalyserNode(nativeContext, mergedOptions);
                const analyserNodeRenderer = (isNativeOfflineAudioContext(nativeContext)) ? createAnalyserNodeRenderer() : null;
                super(context, nativeAnalyserNode, analyserNodeRenderer);
                this._nativeAnalyserNode = nativeAnalyserNode;
            }
            get fftSize() {
                return this._nativeAnalyserNode.fftSize;
            }
            set fftSize(value) {
                this._nativeAnalyserNode.fftSize = value;
            }
            get frequencyBinCount() {
                return this._nativeAnalyserNode.frequencyBinCount;
            }
            get maxDecibels() {
                return this._nativeAnalyserNode.maxDecibels;
            }
            set maxDecibels(value) {
                this._nativeAnalyserNode.maxDecibels = value;
            }
            get minDecibels() {
                return this._nativeAnalyserNode.minDecibels;
            }
            set minDecibels(value) {
                this._nativeAnalyserNode.minDecibels = value;
            }
            get smoothingTimeConstant() {
                return this._nativeAnalyserNode.smoothingTimeConstant;
            }
            set smoothingTimeConstant(value) {
                this._nativeAnalyserNode.smoothingTimeConstant = value;
            }
            getByteFrequencyData(array) {
                this._nativeAnalyserNode.getByteFrequencyData(array);
            }
            getByteTimeDomainData(array) {
                this._nativeAnalyserNode.getByteTimeDomainData(array);
            }
            getFloatFrequencyData(array) {
                this._nativeAnalyserNode.getFloatFrequencyData(array);
            }
            getFloatTimeDomainData(array) {
                this._nativeAnalyserNode.getFloatTimeDomainData(array);
            }
        };
    };

    const getNativeAudioNode = (audioNode) => {
        const nativeAudioNode = AUDIO_NODE_STORE.get(audioNode);
        if (nativeAudioNode === undefined) {
            throw new Error('The associated nativeAudioNode is missing.');
        }
        return nativeAudioNode;
    };

    const isOwnedByContext = (nativeAudioNode, nativeContext) => {
        return nativeAudioNode.context === nativeContext;
    };

    function getAudioGraph(anyContext) {
        const audioGraph = AUDIO_GRAPHS.get(anyContext);
        if (audioGraph === undefined) {
            throw new Error('Missing the audio graph of the given context.');
        }
        return audioGraph;
    }

    const getAudioNodeConnections = (anyAudioNode) => {
        // The builtin types define the context property as BaseAudioContext which is why it needs to be casted here.
        const audioGraph = getAudioGraph(anyAudioNode.context);
        const audioNodeConnections = audioGraph.nodes.get(anyAudioNode);
        if (audioNodeConnections === undefined) {
            throw new Error('Missing the connections of the given AudioNode in the audio graph.');
        }
        return audioNodeConnections;
    };

    const getAudioNodeRenderer = (anyAudioNode) => {
        const audioNodeConnections = getAudioNodeConnections(anyAudioNode);
        if (audioNodeConnections.renderer === null) {
            throw new Error('Missing the renderer of the given AudioNode in the audio graph.');
        }
        return audioNodeConnections.renderer;
    };

    const renderInputsOfAudioNode = (audioNode, nativeOfflineAudioContext, nativeAudioNode) => {
        const audioNodeConnections = getAudioNodeConnections(audioNode);
        return Promise
            .all(audioNodeConnections.inputs
            .map((connections, input) => Array
            .from(connections.values())
            .map(([source, output]) => getAudioNodeRenderer(source)
            .render(source, nativeOfflineAudioContext)
            .then((node) => node.connect(nativeAudioNode, output, input))))
            .reduce((allRenderingPromises, renderingPromises) => [...allRenderingPromises, ...renderingPromises], []));
    };

    const createAnalyserNodeRendererFactory = (createNativeAnalyserNode) => {
        return () => {
            let nativeAnalyserNode = null;
            return {
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeAnalyserNode !== null) {
                        return nativeAnalyserNode;
                    }
                    nativeAnalyserNode = getNativeAudioNode(proxy);
                    /*
                     * If the initially used nativeAnalyserNode was not constructed on the same OfflineAudioContext it needs to be created
                     * again.
                     */
                    if (!isOwnedByContext(nativeAnalyserNode, nativeOfflineAudioContext)) {
                        const options = {
                            channelCount: nativeAnalyserNode.channelCount,
                            channelCountMode: nativeAnalyserNode.channelCountMode,
                            channelInterpretation: nativeAnalyserNode.channelInterpretation,
                            fftSize: nativeAnalyserNode.fftSize,
                            maxDecibels: nativeAnalyserNode.maxDecibels,
                            minDecibels: nativeAnalyserNode.minDecibels,
                            smoothingTimeConstant: nativeAnalyserNode.smoothingTimeConstant
                        };
                        nativeAnalyserNode = createNativeAnalyserNode(nativeOfflineAudioContext, options);
                    }
                    await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeAnalyserNode);
                    return nativeAnalyserNode;
                }
            };
        };
    };

    const ONGOING_TESTS = new Map();
    function cacheTestResult(tester, test) {
        const cachedTestResult = TEST_RESULTS.get(tester);
        if (cachedTestResult !== undefined) {
            return cachedTestResult;
        }
        const ongoingTest = ONGOING_TESTS.get(tester);
        if (ongoingTest !== undefined) {
            return ongoingTest;
        }
        const synchronousTestResult = test();
        if (synchronousTestResult instanceof Promise) {
            ONGOING_TESTS.set(tester, synchronousTestResult);
            return synchronousTestResult
                .then((finalTestResult) => {
                ONGOING_TESTS.delete(tester);
                TEST_RESULTS.set(tester, finalTestResult);
                return finalTestResult;
            });
        }
        TEST_RESULTS.set(tester, synchronousTestResult);
        return synchronousTestResult;
    }

    const testAudioBufferCopyChannelMethodsSubarraySupport = (nativeAudioBuffer) => {
        const source = new Float32Array(2);
        try {
            /*
             * Only Firefox does not fully support the copyFromChannel() and copyToChannel() methods. Therefore testing one of those
             * methods is enough to know if the other one it supported as well.
             */
            nativeAudioBuffer.copyToChannel(source, 0, nativeAudioBuffer.length - 1);
        }
        catch (_a) {
            return false;
        }
        return true;
    };

    const createIndexSizeError = () => {
        try {
            return new DOMException('', 'IndexSizeError');
        }
        catch (err) {
            err.code = 1;
            err.name = 'IndexSizeError';
            return err;
        }
    };

    const wrapAudioBufferCopyChannelMethods = (audioBuffer) => {
        audioBuffer.copyFromChannel = (destination, channelNumber, startInChannel = 0) => {
            if (channelNumber >= audioBuffer.numberOfChannels || startInChannel >= audioBuffer.length) {
                throw createIndexSizeError();
            }
            const channelData = audioBuffer.getChannelData(channelNumber);
            const channelLength = channelData.length;
            const destinationLength = destination.length;
            for (let i = 0; i + startInChannel < channelLength && i < destinationLength; i += 1) {
                destination[i] = channelData[i + startInChannel];
            }
        };
        audioBuffer.copyToChannel = (source, channelNumber, startInChannel = 0) => {
            if (channelNumber >= audioBuffer.numberOfChannels || startInChannel >= audioBuffer.length) {
                throw createIndexSizeError();
            }
            const channelData = audioBuffer.getChannelData(channelNumber);
            const channelLength = channelData.length;
            const sourceLength = source.length;
            for (let i = 0; i + startInChannel < channelLength && i < sourceLength; i += 1) {
                channelData[i + startInChannel] = source[i];
            }
        };
    };

    const wrapAudioBufferCopyChannelMethodsSubarray = (audioBuffer) => {
        audioBuffer.copyFromChannel = ((copyFromChannel) => {
            return (destination, channelNumber, startInChannel = 0) => {
                if (channelNumber >= audioBuffer.numberOfChannels || startInChannel >= audioBuffer.length) {
                    throw createIndexSizeError();
                }
                if (startInChannel < audioBuffer.length && audioBuffer.length - startInChannel < destination.length) {
                    return copyFromChannel.call(audioBuffer, destination.subarray(0, audioBuffer.length - startInChannel), channelNumber, startInChannel);
                }
                return copyFromChannel.call(audioBuffer, destination, channelNumber, startInChannel);
            };
        })(audioBuffer.copyFromChannel);
        audioBuffer.copyToChannel = ((copyToChannel) => {
            return (source, channelNumber, startInChannel = 0) => {
                if (channelNumber >= audioBuffer.numberOfChannels || startInChannel >= audioBuffer.length) {
                    throw createIndexSizeError();
                }
                if (startInChannel < audioBuffer.length && audioBuffer.length - startInChannel < source.length) {
                    return copyToChannel.call(audioBuffer, source.subarray(0, audioBuffer.length - startInChannel), channelNumber, startInChannel);
                }
                return copyToChannel.call(audioBuffer, source, channelNumber, startInChannel);
            };
        })(audioBuffer.copyToChannel);
    };

    const wrapAudioBufferGetChannelDataMethod = (audioBuffer) => {
        audioBuffer.getChannelData = ((getChannelData) => {
            return (channel) => {
                try {
                    return getChannelData.call(audioBuffer, channel);
                }
                catch (err) {
                    if (err.code === 12) {
                        throw createIndexSizeError();
                    }
                    throw err; // tslint:disable-line:rxjs-throw-error
                }
            };
        })(audioBuffer.getChannelData);
    };

    const DEFAULT_OPTIONS$1 = {
        numberOfChannels: 1
    };
    const createAudioBufferConstructor = (createNotSupportedError, nativeAudioBufferConstructor, nativeOfflineAudioContextConstructor, testNativeAudioBufferConstructorSupport) => {
        let nativeOfflineAudioContext = null;
        return class AudioBuffer {
            constructor(options) {
                if (nativeOfflineAudioContextConstructor === null) {
                    throw new Error(); // @todo
                }
                const { length, numberOfChannels, sampleRate } = Object.assign({}, DEFAULT_OPTIONS$1, options);
                if (nativeOfflineAudioContext === null) {
                    nativeOfflineAudioContext = new nativeOfflineAudioContextConstructor(1, 1, 44100);
                }
                /*
                 * Bug #99: Firefox does not throw a NotSupportedError when the numberOfChannels is zero. But it only does it when using the
                 * factory function. But since Firefox also supports the constructor everything should be fine.
                 */
                const audioBuffer = (nativeAudioBufferConstructor !== null &&
                    cacheTestResult(testNativeAudioBufferConstructorSupport, () => testNativeAudioBufferConstructorSupport())) ?
                    new nativeAudioBufferConstructor({ length, numberOfChannels, sampleRate }) :
                    nativeOfflineAudioContext.createBuffer(numberOfChannels, length, sampleRate);
                // Bug #5: Safari does not support copyFromChannel() and copyToChannel().
                // Bug #100: Safari does throw a wrong error when calling getChannelData() with an out-of-bounds value.
                if (typeof audioBuffer.copyFromChannel !== 'function') {
                    wrapAudioBufferCopyChannelMethods(audioBuffer);
                    wrapAudioBufferGetChannelDataMethod(audioBuffer);
                    // Bug #42: Firefox does not yet fully support copyFromChannel() and copyToChannel().
                }
                else if (!cacheTestResult(testAudioBufferCopyChannelMethodsSubarraySupport, () => testAudioBufferCopyChannelMethodsSubarraySupport(audioBuffer))) {
                    wrapAudioBufferCopyChannelMethodsSubarray(audioBuffer);
                }
                // Bug #99: Safari does not throw an error when the numberOfChannels is zero.
                if (audioBuffer.numberOfChannels === 0) {
                    throw createNotSupportedError();
                }
                /*
                 * This does violate all good pratices but it is necessary to allow this AudioBuffer to be used with native
                 * (Offline)AudioContexts.
                 */
                return audioBuffer;
            }
            // This method needs to be defined to convince TypeScript that the IAudioBuffer will be implemented.
            copyFromChannel(_1, _2, _3 = 0) { } // tslint:disable-line:no-empty
            // This method needs to be defined to convince TypeScript that the IAudioBuffer will be implemented.
            copyToChannel(_1, _2, _3 = 0) { } // tslint:disable-line:no-empty
            // This method needs to be defined to convince TypeScript that the IAudioBuffer will be implemented.
            getChannelData(_) {
                return new Float32Array(0);
            }
        };
    };

    const DEFAULT_OPTIONS$2 = {
        buffer: null,
        channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers',
        detune: 0,
        loop: false,
        loopEnd: 0,
        loopStart: 0,
        playbackRate: 1
    };
    const createAudioBufferSourceNodeConstructor = (createAudioBufferSourceNodeRenderer, createAudioParam, createInvalidStateError, createNativeAudioBufferSourceNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class AudioBufferSourceNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS$2) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS$2, options);
                const nativeAudioBufferSourceNode = createNativeAudioBufferSourceNode(nativeContext, mergedOptions);
                const isOffline = isNativeOfflineAudioContext(nativeContext);
                const audioBufferSourceNodeRenderer = (isOffline) ? createAudioBufferSourceNodeRenderer() : null;
                super(context, nativeAudioBufferSourceNode, audioBufferSourceNodeRenderer);
                this._audioBufferSourceNodeRenderer = audioBufferSourceNodeRenderer;
                this._detune = createAudioParam(context, isOffline, nativeAudioBufferSourceNode.detune);
                this._isBufferNullified = false;
                this._isBufferSet = false;
                this._nativeAudioBufferSourceNode = nativeAudioBufferSourceNode;
                // Bug #73: Edge & Safari do not export the correct values for maxValue and minValue.
                this._playbackRate = createAudioParam(context, isOffline, nativeAudioBufferSourceNode.playbackRate, 3.4028234663852886e38, -3.4028234663852886e38);
            }
            get buffer() {
                if (this._isBufferNullified) {
                    return null;
                }
                return this._nativeAudioBufferSourceNode.buffer;
            }
            set buffer(value) {
                // Bug #71: Edge does not allow to set the buffer to null.
                try {
                    this._nativeAudioBufferSourceNode.buffer = value;
                }
                catch (err) {
                    if (value !== null || err.code !== 17) {
                        throw err; // tslint:disable-line:rxjs-throw-error
                    }
                    // @todo Create a new internal nativeAudioBufferSourceNode.
                    this._isBufferNullified = (this._nativeAudioBufferSourceNode.buffer !== null);
                }
                // Bug #72: Only Chrome, Edge & Opera do not allow to reassign the buffer yet.
                if (value !== null) {
                    if (this._isBufferSet) {
                        throw createInvalidStateError();
                    }
                    this._isBufferSet = true;
                }
            }
            get onended() {
                return this._nativeAudioBufferSourceNode.onended;
            }
            set onended(value) {
                this._nativeAudioBufferSourceNode.onended = value;
            }
            get detune() {
                return this._detune;
            }
            get loop() {
                return this._nativeAudioBufferSourceNode.loop;
            }
            set loop(value) {
                this._nativeAudioBufferSourceNode.loop = value;
            }
            get loopEnd() {
                return this._nativeAudioBufferSourceNode.loopEnd;
            }
            set loopEnd(value) {
                this._nativeAudioBufferSourceNode.loopEnd = value;
            }
            get loopStart() {
                return this._nativeAudioBufferSourceNode.loopStart;
            }
            set loopStart(value) {
                this._nativeAudioBufferSourceNode.loopStart = value;
            }
            get playbackRate() {
                return this._playbackRate;
            }
            start(when = 0, offset = 0, duration) {
                this._nativeAudioBufferSourceNode.start(when, offset, duration);
                if (this._audioBufferSourceNodeRenderer !== null) {
                    this._audioBufferSourceNodeRenderer.start = (duration === undefined) ? [when, offset] : [when, offset, duration];
                }
            }
            stop(when = 0) {
                this._nativeAudioBufferSourceNode.stop(when);
                if (this._audioBufferSourceNodeRenderer !== null) {
                    this._audioBufferSourceNodeRenderer.stop = when;
                }
            }
        };
    };

    const createAudioBufferSourceNodeRendererFactory = (createNativeAudioBufferSourceNode) => {
        return () => {
            let nativeAudioBufferSourceNode = null;
            let start = null;
            let stop = null;
            return {
                set start(value) {
                    start = value;
                },
                set stop(value) {
                    stop = value;
                },
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeAudioBufferSourceNode !== null) {
                        return nativeAudioBufferSourceNode;
                    }
                    nativeAudioBufferSourceNode = getNativeAudioNode(proxy);
                    /*
                     * If the initially used nativeAudioBufferSourceNode was not constructed on the same OfflineAudioContext it needs to be
                     * created again.
                     */
                    if (!isOwnedByContext(nativeAudioBufferSourceNode, nativeOfflineAudioContext)) {
                        const options = {
                            buffer: nativeAudioBufferSourceNode.buffer,
                            channelCount: nativeAudioBufferSourceNode.channelCount,
                            channelCountMode: nativeAudioBufferSourceNode.channelCountMode,
                            channelInterpretation: nativeAudioBufferSourceNode.channelInterpretation,
                            detune: 0,
                            loop: nativeAudioBufferSourceNode.loop,
                            loopEnd: nativeAudioBufferSourceNode.loopEnd,
                            loopStart: nativeAudioBufferSourceNode.loopStart,
                            playbackRate: nativeAudioBufferSourceNode.playbackRate.value
                        };
                        nativeAudioBufferSourceNode = createNativeAudioBufferSourceNode(nativeOfflineAudioContext, options);
                        if (start !== null) {
                            nativeAudioBufferSourceNode.start(...start);
                        }
                        if (stop !== null) {
                            nativeAudioBufferSourceNode.stop(stop);
                        }
                    }
                    await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeAudioBufferSourceNode);
                    return nativeAudioBufferSourceNode;
                }
            };
        };
    };

    const createAudioDestinationNodeConstructor = (audioNodeConstructor, createAudioDestinationNodeRenderer, createIndexSizeError, createInvalidStateError, createNativeAudioDestinationNode, isNativeOfflineAudioContext) => {
        return class AudioDestinationNode extends audioNodeConstructor {
            constructor(context, channelCount) {
                const nativeContext = getNativeContext(context);
                const isOffline = isNativeOfflineAudioContext(nativeContext);
                const nativeAudioDestinationNode = createNativeAudioDestinationNode(nativeContext, channelCount, isOffline);
                const audioDestinationNodeRenderer = (isOffline) ? createAudioDestinationNodeRenderer() : null;
                const audioGraph = { audioWorkletGlobalScope: null, nodes: new WeakMap(), params: new WeakMap() };
                AUDIO_GRAPHS.set(context, audioGraph);
                AUDIO_GRAPHS.set(nativeContext, audioGraph);
                super(context, nativeAudioDestinationNode, audioDestinationNodeRenderer);
                this._isNodeOfNativeOfflineAudioContext = isOffline;
                this._nativeAudioDestinationNode = nativeAudioDestinationNode;
            }
            get channelCount() {
                return this._nativeAudioDestinationNode.channelCount;
            }
            set channelCount(value) {
                // Bug #52: Chrome, Edge, Opera & Safari do not throw an exception at all.
                // Bug #54: Firefox does throw an IndexSizeError.
                if (this._isNodeOfNativeOfflineAudioContext) {
                    throw createInvalidStateError();
                }
                // Bug #47: The AudioDestinationNode in Edge and Safari do not initialize the maxChannelCount property correctly.
                if (value > this._nativeAudioDestinationNode.maxChannelCount) {
                    throw createIndexSizeError();
                }
                this._nativeAudioDestinationNode.channelCount = value;
            }
            get channelCountMode() {
                return this._nativeAudioDestinationNode.channelCountMode;
            }
            set channelCountMode(value) {
                // Bug #53: No browser does throw an exception yet.
                if (this._isNodeOfNativeOfflineAudioContext) {
                    throw createInvalidStateError();
                }
                this._nativeAudioDestinationNode.channelCountMode = value;
            }
            get maxChannelCount() {
                return this._nativeAudioDestinationNode.maxChannelCount;
            }
        };
    };

    const createAudioDestinationNodeRenderer = () => {
        let nativeAudioDestinationNode = null;
        return {
            render: async (proxy, nativeOfflineAudioContext) => {
                if (nativeAudioDestinationNode !== null) {
                    return nativeAudioDestinationNode;
                }
                nativeAudioDestinationNode = nativeOfflineAudioContext.destination;
                await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeAudioDestinationNode);
                return nativeAudioDestinationNode;
            }
        };
    };

    class EventTarget {
        addEventListener(type, listener, // @todo EventListenerOrEventListenerObject | null = null,
        options) {
        }
        dispatchEvent(evt) {
            return false;
        }
        removeEventListener(type, listener, // @todo EventListenerOrEventListenerObject | null = null,
        options) {
        }
    }

    const isAudioNode = (audioNodeOrAudioParam) => {
        return (audioNodeOrAudioParam.context !== undefined);
    };

    function getAudioParamConnections(anyContext, audioParam) {
        const audioGraph = getAudioGraph(anyContext);
        const audioParamConnections = audioGraph.params.get(audioParam);
        if (audioParamConnections === undefined) {
            throw new Error('Missing the connections of the given AudioParam in the audio graph.');
        }
        return audioParamConnections;
    }

    const getNativeAudioParam = (audioParam) => {
        const nativeAudioParam = AUDIO_PARAM_STORE.get(audioParam);
        if (nativeAudioParam === undefined) {
            throw new Error('The associated nativeAudioParam is missing.');
        }
        return nativeAudioParam;
    };

    const testAudioNodeDisconnectMethodSupport = (nativeAudioContext) => {
        return new Promise((resolve) => {
            const analyzer = nativeAudioContext.createScriptProcessor(256, 1, 1);
            const dummy = nativeAudioContext.createGain();
            // Bug #95: Safari does not play one sample buffers.
            const ones = nativeAudioContext.createBuffer(1, 2, 44100);
            const channelData = ones.getChannelData(0);
            channelData[0] = 1;
            channelData[1] = 1;
            const source = nativeAudioContext.createBufferSource();
            source.buffer = ones;
            source.loop = true;
            source.connect(analyzer);
            analyzer.connect(nativeAudioContext.destination);
            source.connect(dummy);
            source.disconnect(dummy);
            analyzer.onaudioprocess = (event) => {
                const chnnlDt = event.inputBuffer.getChannelData(0);
                if (Array.prototype.some.call(chnnlDt, (sample) => sample === 1)) {
                    resolve(true);
                }
                else {
                    resolve(false);
                }
                source.stop();
                analyzer.onaudioprocess = null; // tslint:disable-line:deprecation
                source.disconnect(analyzer);
                analyzer.disconnect(nativeAudioContext.destination);
            };
            source.start();
        });
    };

    const wrapAudioNodeDisconnectMethod = (nativeAudioNode) => {
        const destinations = new Map();
        nativeAudioNode.connect = ((connect) => {
            return (destination, output = 0, input = 0) => {
                destinations.set(destination, { input, output });
                if (destination instanceof AudioNode) {
                    return connect.call(nativeAudioNode, destination, output, input);
                }
                return connect.call(nativeAudioNode, destination, output);
            };
        })(nativeAudioNode.connect);
        nativeAudioNode.disconnect = ((disconnect) => {
            return (outputOrDestination, _output, _input) => {
                disconnect.apply(nativeAudioNode);
                if (outputOrDestination === undefined) {
                    destinations.clear();
                }
                else if (destinations.has(outputOrDestination)) {
                    destinations.delete(outputOrDestination);
                    destinations.forEach(({ input, output }, dstntn) => {
                        nativeAudioNode.connect(dstntn, input, output);
                    });
                }
            };
        })(nativeAudioNode.disconnect);
    };

    const addAudioNode = (context, audioNode, audioNoderRender, nativeAudioNode) => {
        const audioGraph = getAudioGraph(context);
        const inputs = [];
        for (let i = 0; i < nativeAudioNode.numberOfInputs; i += 1) {
            inputs.push(new Set());
        }
        const audioNodeConnections = { inputs, outputs: new Set(), renderer: audioNoderRender };
        audioGraph.nodes.set(audioNode, audioNodeConnections);
        audioGraph.nodes.set(nativeAudioNode, audioNodeConnections);
    };
    const addConnectionToAudioNode = (source, destination, output, input) => {
        const audioNodeConnectionsOfSource = getAudioNodeConnections(source);
        const audioNodeConnectionsOfDestination = getAudioNodeConnections(destination);
        audioNodeConnectionsOfSource.outputs.add([destination, output, input]);
        audioNodeConnectionsOfDestination.inputs[input].add([source, output]);
    };
    const addConnectionToAudioParam = (source, destination, output) => {
        const audioNodeConnections = getAudioNodeConnections(source);
        const audioParamConnections = getAudioParamConnections(source.context, destination);
        audioNodeConnections.outputs.add([destination, output]);
        audioParamConnections.inputs.add([source, output]);
    };
    const deleteInputsOfAudioNode = (source, destination, output, input) => {
        const { inputs } = getAudioNodeConnections(destination);
        const length = inputs.length;
        for (let i = 0; i < length; i += 1) {
            if (input === undefined || input === i) {
                const connectionsToInput = inputs[i];
                for (const connection of connectionsToInput.values()) {
                    if (connection[0] === source && (output === undefined || connection[1] === output)) {
                        connectionsToInput.delete(connection);
                    }
                }
            }
        }
    };
    const deleteInputsOfAudioParam = (source, destination, output) => {
        const audioParamConnections = getAudioParamConnections(source.context, destination);
        for (const connection of audioParamConnections.inputs) {
            if (connection[0] === source && (output === undefined || connection[1] === output)) {
                audioParamConnections.inputs.delete(connection);
            }
        }
    };
    const deleteOutputsOfAudioNode = (source, destination, output, input) => {
        const audioNodeConnectionsOfSource = getAudioNodeConnections(source);
        for (const connection of audioNodeConnectionsOfSource.outputs.values()) {
            if (connection[0] === destination
                && (output === undefined || connection[1] === output)
                && (input === undefined || connection[2] === input)) {
                audioNodeConnectionsOfSource.outputs.delete(connection);
            }
        }
    };
    const deleteAnyConnection = (source) => {
        const audioNodeConnectionsOfSource = getAudioNodeConnections(source);
        for (const [destination] of audioNodeConnectionsOfSource.outputs) {
            if (isAudioNode(destination)) {
                deleteInputsOfAudioNode(source, destination);
            }
            else {
                deleteInputsOfAudioParam(source, destination);
            }
        }
        audioNodeConnectionsOfSource.outputs.clear();
    };
    const deleteConnectionAtOutput = (source, output) => {
        const audioNodeConnectionsOfSource = getAudioNodeConnections(source);
        Array
            .from(audioNodeConnectionsOfSource.outputs)
            .filter((connection) => connection[1] === output)
            .forEach((connection) => {
            const [destination] = connection;
            if (isAudioNode(destination)) {
                deleteInputsOfAudioNode(source, destination, connection[1], connection[2]);
            }
            else {
                deleteInputsOfAudioParam(source, destination, connection[1]);
            }
            audioNodeConnectionsOfSource.outputs.delete(connection);
        });
    };
    const deleteConnectionToDestination = (source, destination, output, input) => {
        deleteOutputsOfAudioNode(source, destination, output, input);
        if (isAudioNode(destination)) {
            deleteInputsOfAudioNode(source, destination, output, input);
        }
        else {
            deleteInputsOfAudioParam(source, destination, output);
        }
    };
    const createAudioNodeConstructor = (createInvalidAccessError, isNativeOfflineAudioContext) => {
        return class AudioNode extends EventTarget {
            constructor(context, nativeAudioNode, audioNodeRenderer) {
                super();
                this._context = context;
                this._nativeAudioNode = nativeAudioNode;
                const nativeContext = getNativeContext(context);
                // Bug #12: Firefox and Safari do not support to disconnect a specific destination.
                // @todo Make sure this is not used with an OfflineAudioContext.
                if (!isNativeOfflineAudioContext(nativeContext) && true !== cacheTestResult(testAudioNodeDisconnectMethodSupport, () => {
                    return testAudioNodeDisconnectMethodSupport(nativeContext);
                })) {
                    wrapAudioNodeDisconnectMethod(nativeAudioNode);
                }
                AUDIO_NODE_STORE.set(this, nativeAudioNode);
                addAudioNode(context, this, audioNodeRenderer, nativeAudioNode);
            }
            get channelCount() {
                return this._nativeAudioNode.channelCount;
            }
            set channelCount(value) {
                this._nativeAudioNode.channelCount = value;
            }
            get channelCountMode() {
                return this._nativeAudioNode.channelCountMode;
            }
            set channelCountMode(value) {
                this._nativeAudioNode.channelCountMode = value;
            }
            get channelInterpretation() {
                return this._nativeAudioNode.channelInterpretation;
            }
            set channelInterpretation(value) {
                this._nativeAudioNode.channelInterpretation = value;
            }
            get context() {
                return this._context;
            }
            get numberOfInputs() {
                return this._nativeAudioNode.numberOfInputs;
            }
            get numberOfOutputs() {
                return this._nativeAudioNode.numberOfOutputs;
            }
            addEventListener(type, listener, // @todo EventListenerOrEventListenerObject | null = null,
            options) {
                return this._nativeAudioNode.addEventListener(type, listener, options);
            }
            connect(destination, output = 0, input = 0) {
                const nativeContext = getNativeContext(this._context);
                if (isAudioNode(destination)) {
                    // Bug #41: Only Chrome, Firefox and Opera throw the correct exception by now.
                    if (this._context !== destination.context) {
                        throw createInvalidAccessError();
                    }
                    if (!isNativeOfflineAudioContext(nativeContext)) {
                        const nativeDestinationNode = getNativeAudioNode(destination);
                        if (nativeDestinationNode.inputs !== undefined) {
                            const inputs = nativeDestinationNode.inputs;
                            this._nativeAudioNode.connect(inputs[input], output, 0);
                        }
                        else {
                            this._nativeAudioNode.connect(nativeDestinationNode, output, input);
                        }
                    }
                    addConnectionToAudioNode(this, destination, output, input);
                    return destination;
                }
                const nativeAudioParam = getNativeAudioParam(destination);
                try {
                    this._nativeAudioNode.connect(nativeAudioParam, output);
                    // @todo Calling connect() is only needed to throw possible errors when the nativeContext is an OfflineAudioContext.
                    if (isNativeOfflineAudioContext(nativeContext)) {
                        this._nativeAudioNode.disconnect(nativeAudioParam, output);
                    }
                }
                catch (err) {
                    // Bug #58: Only Firefox does throw an InvalidStateError yet.
                    if (err.code === 12) {
                        throw createInvalidAccessError();
                    }
                    throw err; // tslint:disable-line:rxjs-throw-error
                }
                addConnectionToAudioParam(this, destination, output);
            }
            disconnect(destinationOrOutput, output, input) {
                const nativeContext = getNativeContext(this._context);
                if (!isNativeOfflineAudioContext(nativeContext)) {
                    if (destinationOrOutput === undefined) {
                        this._nativeAudioNode.disconnect();
                    }
                    else if (typeof destinationOrOutput === 'number') {
                        this._nativeAudioNode.disconnect(destinationOrOutput);
                    }
                    else if (isAudioNode(destinationOrOutput)) {
                        const nativeDestinationNode = getNativeAudioNode(destinationOrOutput);
                        if (nativeDestinationNode.inputs !== undefined) {
                            const inputs = nativeDestinationNode.inputs;
                            const numberOfInputs = inputs.length;
                            for (let i = 0; i < numberOfInputs; i += 1) {
                                if (input === undefined || input === i) {
                                    if (output === undefined) {
                                        this._nativeAudioNode.disconnect(inputs[i]);
                                    }
                                    else {
                                        this._nativeAudioNode.disconnect(inputs[i], output);
                                    }
                                }
                            }
                        }
                        else {
                            if (output === undefined) {
                                this._nativeAudioNode.disconnect(nativeDestinationNode);
                            }
                            else if (input === undefined) {
                                this._nativeAudioNode.disconnect(nativeDestinationNode, output);
                            }
                            else {
                                this._nativeAudioNode.disconnect(nativeDestinationNode, output, input);
                            }
                        }
                    }
                    else {
                        const nativeAudioParam = getNativeAudioParam(destinationOrOutput);
                        if (output === undefined) {
                            this._nativeAudioNode.disconnect(nativeAudioParam);
                        }
                        else {
                            this._nativeAudioNode.disconnect(nativeAudioParam, output);
                        }
                    }
                }
                if (destinationOrOutput === undefined) {
                    deleteAnyConnection(this);
                }
                else if (typeof destinationOrOutput === 'number') {
                    deleteConnectionAtOutput(this, destinationOrOutput);
                }
                else {
                    deleteConnectionToDestination(this, destinationOrOutput, output, input);
                }
            }
            removeEventListener(type, listener, // @todo EventListenerOrEventListenerObject | null = null,
            options) {
                return this._nativeAudioNode.removeEventListener(type, listener, options);
            }
        };
    };

    const addAudioParam = (context, audioParam, audioParamRenderer) => {
        const audioGraph = getAudioGraph(context);
        audioGraph.params.set(audioParam, { inputs: new Set(), renderer: audioParamRenderer });
    };
    const createAudioParamFactory = (createAudioParamRenderer) => {
        return (context, isAudioParamOfOfflineAudioContext, nativeAudioParam, maxValue = null, minValue = null) => {
            const audioParamRenderer = (isAudioParamOfOfflineAudioContext) ? createAudioParamRenderer() : null;
            const audioParam = {
                get defaultValue() {
                    return nativeAudioParam.defaultValue;
                },
                get maxValue() {
                    return (maxValue === null) ? nativeAudioParam.maxValue : maxValue;
                },
                get minValue() {
                    return (minValue === null) ? nativeAudioParam.minValue : minValue;
                },
                get value() {
                    return nativeAudioParam.value;
                },
                set value(value) {
                    nativeAudioParam.value = value;
                    // Bug #98: Edge, Firefox & Safari do not yet treat the value setter like a call to setValueAtTime().
                    audioParam.setValueAtTime(value, context.currentTime);
                },
                cancelScheduledValues(cancelTime) {
                    nativeAudioParam.cancelScheduledValues(cancelTime);
                    // @todo
                    return audioParam;
                },
                exponentialRampToValueAtTime(value, endTime) {
                    nativeAudioParam.exponentialRampToValueAtTime(value, endTime);
                    if (audioParamRenderer !== null) {
                        audioParamRenderer.record({ endTime, type: 'exponentialRampToValue', value });
                    }
                    return audioParam;
                },
                linearRampToValueAtTime(value, endTime) {
                    nativeAudioParam.linearRampToValueAtTime(value, endTime);
                    if (audioParamRenderer !== null) {
                        audioParamRenderer.record({ endTime, type: 'linearRampToValue', value });
                    }
                    return audioParam;
                },
                setTargetAtTime(target, startTime, timeConstant) {
                    nativeAudioParam.setTargetAtTime(target, startTime, timeConstant);
                    if (audioParamRenderer !== null) {
                        audioParamRenderer.record({ startTime, target, timeConstant, type: 'setTarget' });
                    }
                    return audioParam;
                },
                setValueAtTime(value, startTime) {
                    nativeAudioParam.setValueAtTime(value, startTime);
                    if (audioParamRenderer !== null) {
                        audioParamRenderer.record({ startTime, type: 'setValue', value });
                    }
                    return audioParam;
                },
                setValueCurveAtTime(values, startTime, duration) {
                    nativeAudioParam.setValueCurveAtTime(values, startTime, duration);
                    if (audioParamRenderer !== null) {
                        audioParamRenderer.record({ duration, startTime, type: 'setValueCurve', values });
                    }
                    return audioParam;
                }
            };
            AUDIO_PARAM_STORE.set(audioParam, nativeAudioParam);
            addAudioParam(context, audioParam, audioParamRenderer);
            return audioParam;
        };
    };

    const createAudioParamRenderer = () => {
        const automations = [];
        return {
            record(automation) {
                automations.push(automation);
            },
            replay(audioParam) {
                for (const automation of automations) {
                    if (automation.type === 'exponentialRampToValue') {
                        const { endTime, value } = automation;
                        audioParam.exponentialRampToValueAtTime(value, endTime);
                    }
                    else if (automation.type === 'linearRampToValue') {
                        const { endTime, value } = automation;
                        audioParam.linearRampToValueAtTime(value, endTime);
                    }
                    else if (automation.type === 'setTarget') {
                        const { startTime, target, timeConstant } = automation;
                        audioParam.setTargetAtTime(target, startTime, timeConstant);
                    }
                    else if (automation.type === 'setValue') {
                        const { startTime, value } = automation;
                        audioParam.setValueAtTime(value, startTime);
                    }
                    else if (automation.type === 'setValueCurve') {
                        const { duration, startTime, values } = automation;
                        /*
                         * @todo TypeScript can't combine the call signatures of setValueCurveAtTime() of IAudioParam and TNativeAudioParam as
                         * their return types are incompatible.
                         */
                        audioParam.setValueCurveAtTime(values, startTime, duration);
                    }
                    else {
                        throw new Error("Can't apply an unkown automation.");
                    }
                }
            }
        };
    };

    const renderInputsOfAudioParam = (context, audioParam, nativeOfflineAudioContext, nativeAudioParam) => {
        const audioParamConnections = getAudioParamConnections(context, audioParam);
        return Promise
            .all(Array
            .from(audioParamConnections.inputs)
            .map(([source, output]) => {
            const audioNodeRenderer = getAudioNodeRenderer(source);
            return audioNodeRenderer
                .render(source, nativeOfflineAudioContext)
                .then((node) => node.connect(nativeAudioParam, output));
        }));
    };

    const connectAudioParam = (context, nativeOfflineAudioContext, audioParam, nativeAudioParam = getNativeAudioParam(audioParam)) => {
        return renderInputsOfAudioParam(context, audioParam, nativeOfflineAudioContext, nativeAudioParam);
    };

    function getAudioParamRenderer(anyContext, audioParam) {
        const audioParamConnections = getAudioParamConnections(anyContext, audioParam);
        if (audioParamConnections.renderer === null) {
            throw new Error('Missing the renderer of the given AudioParam in the audio graph.');
        }
        return audioParamConnections.renderer;
    }

    const renderAutomation = (context, nativeOfflineAudioContext, audioParam, nativeAudioParam) => {
        const audioParamRenderer = getAudioParamRenderer(context, audioParam);
        audioParamRenderer.replay(nativeAudioParam);
        return renderInputsOfAudioParam(context, audioParam, nativeOfflineAudioContext, nativeAudioParam);
    };

    const createBaseAudioContextConstructor = (addAudioWorkletModule, analyserNodeConstructor, audioBufferConstructor, audioBufferSourceNodeConstructor, biquadFilterNodeConstructor, channelMergerNodeConstructor, channelSplitterNodeConstructor, constantSourceNodeConstructor, decodeAudioData, gainNodeConstructor, iIRFilterNodeConstructor, minimalBaseAudioContextConstructor, oscillatorNodeConstructor, stereoPannerNodeConstructor, waveShaperNodeConstructor) => {
        return class BaseAudioContext extends minimalBaseAudioContextConstructor {
            constructor(nativeContext, numberOfChannels) {
                super(nativeContext, numberOfChannels);
                this._audioWorklet = (addAudioWorkletModule === undefined) ?
                    undefined :
                    { addModule: (moduleURL, options) => addAudioWorkletModule(this, moduleURL, options) };
                this._nativeContext = nativeContext;
            }
            get audioWorklet() {
                return this._audioWorklet;
            }
            createAnalyser() {
                return new analyserNodeConstructor(this);
            }
            createBiquadFilter() {
                return new biquadFilterNodeConstructor(this);
            }
            createBuffer(numberOfChannels, length, sampleRate) {
                return new audioBufferConstructor({ length, numberOfChannels, sampleRate });
            }
            createBufferSource() {
                return new audioBufferSourceNodeConstructor(this);
            }
            createChannelMerger(numberOfInputs = 6) {
                return new channelMergerNodeConstructor(this, { numberOfInputs });
            }
            createChannelSplitter(numberOfOutputs = 6) {
                return new channelSplitterNodeConstructor(this, { numberOfOutputs });
            }
            createConstantSource() {
                return new constantSourceNodeConstructor(this);
            }
            createGain() {
                return new gainNodeConstructor(this);
            }
            createIIRFilter(feedforward, feedback) {
                return new iIRFilterNodeConstructor(this, { feedback, feedforward });
            }
            createOscillator() {
                return new oscillatorNodeConstructor(this);
            }
            createStereoPanner() {
                return new stereoPannerNodeConstructor(this);
            }
            createWaveShaper() {
                return new waveShaperNodeConstructor(this);
            }
            decodeAudioData(audioData, successCallback, errorCallback) {
                return decodeAudioData(this._nativeContext, audioData)
                    .then((audioBuffer) => {
                    if (typeof successCallback === 'function') {
                        successCallback(audioBuffer);
                    }
                    return audioBuffer;
                })
                    .catch((err) => {
                    if (typeof errorCallback === 'function') {
                        errorCallback(err);
                    }
                    throw err; // tslint:disable-line:rxjs-throw-error
                });
            }
        };
    };

    const DEFAULT_OPTIONS$4 = {
        Q: 1,
        channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers',
        detune: 0,
        frequency: 350,
        gain: 0,
        type: 'lowpass'
    };
    const createBiquadFilterNodeConstructor = (createAudioParam, createBiquadFilterNodeRenderer, createInvalidAccessError, createNativeBiquadFilterNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class BiquadFilterNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS$4) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS$4, options);
                const nativeBiquadFilterNode = createNativeBiquadFilterNode(nativeContext, mergedOptions);
                const isOffline = isNativeOfflineAudioContext(nativeContext);
                const biquadFilterNodeRenderer = (isOffline) ? createBiquadFilterNodeRenderer() : null;
                super(context, nativeBiquadFilterNode, biquadFilterNodeRenderer);
                // Bug #80: Edge & Safari do not export the correct values for maxValue and minValue.
                this._Q = createAudioParam(context, isOffline, nativeBiquadFilterNode.Q, 3.4028234663852886e38, -3.4028234663852886e38);
                // Bug #78: Edge & Safari do not export the correct values for maxValue and minValue.
                this._detune = createAudioParam(context, isOffline, nativeBiquadFilterNode.detune, 3.4028234663852886e38, -3.4028234663852886e38);
                // Bug #77: Chrome, Edge, Firefox, Opera & Safari do not export the correct values for maxValue and minValue.
                this._frequency = createAudioParam(context, isOffline, nativeBiquadFilterNode.frequency, 3.4028234663852886e38, -3.4028234663852886e38);
                // Bug #79: Edge & Safari do not export the correct values for maxValue and minValue.
                this._gain = createAudioParam(context, isOffline, nativeBiquadFilterNode.gain, 3.4028234663852886e38, -3.4028234663852886e38);
                this._nativeBiquadFilterNode = nativeBiquadFilterNode;
            }
            get Q() {
                return this._Q;
            }
            get detune() {
                return this._detune;
            }
            get frequency() {
                return this._frequency;
            }
            get gain() {
                return this._gain;
            }
            get type() {
                return this._nativeBiquadFilterNode.type;
            }
            set type(value) {
                this._nativeBiquadFilterNode.type = value;
            }
            getFrequencyResponse(frequencyHz, magResponse, phaseResponse) {
                this._nativeBiquadFilterNode.getFrequencyResponse(frequencyHz, magResponse, phaseResponse);
                // Bug #68: Only Chrome & Opera do throw an error if the parameters differ in their length.
                if ((frequencyHz.length !== magResponse.length) || (magResponse.length !== phaseResponse.length)) {
                    throw createInvalidAccessError();
                }
            }
        };
    };

    const createBiquadFilterNodeRendererFactory = (createNativeBiquadFilterNode) => {
        return () => {
            let nativeBiquadFilterNode = null;
            return {
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeBiquadFilterNode !== null) {
                        return nativeBiquadFilterNode;
                    }
                    nativeBiquadFilterNode = getNativeAudioNode(proxy);
                    /*
                     * If the initially used nativeBiquadFilterNode was not constructed on the same OfflineAudioContext it needs to be created
                     * again.
                     */
                    if (!isOwnedByContext(nativeBiquadFilterNode, nativeOfflineAudioContext)) {
                        const options = {
                            Q: nativeBiquadFilterNode.Q.value,
                            channelCount: nativeBiquadFilterNode.channelCount,
                            channelCountMode: nativeBiquadFilterNode.channelCountMode,
                            channelInterpretation: nativeBiquadFilterNode.channelInterpretation,
                            detune: nativeBiquadFilterNode.detune.value,
                            frequency: nativeBiquadFilterNode.frequency.value,
                            gain: nativeBiquadFilterNode.gain.value,
                            type: nativeBiquadFilterNode.type
                        };
                        nativeBiquadFilterNode = createNativeBiquadFilterNode(nativeOfflineAudioContext, options);
                        await renderAutomation(proxy.context, nativeOfflineAudioContext, proxy.Q, nativeBiquadFilterNode.Q);
                        await renderAutomation(proxy.context, nativeOfflineAudioContext, proxy.detune, nativeBiquadFilterNode.detune);
                        await renderAutomation(proxy.context, nativeOfflineAudioContext, proxy.frequency, nativeBiquadFilterNode.frequency);
                        await renderAutomation(proxy.context, nativeOfflineAudioContext, proxy.gain, nativeBiquadFilterNode.gain);
                    }
                    else {
                        await connectAudioParam(proxy.context, nativeOfflineAudioContext, proxy.Q);
                        await connectAudioParam(proxy.context, nativeOfflineAudioContext, proxy.detune);
                        await connectAudioParam(proxy.context, nativeOfflineAudioContext, proxy.frequency);
                        await connectAudioParam(proxy.context, nativeOfflineAudioContext, proxy.gain);
                    }
                    await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeBiquadFilterNode);
                    return nativeBiquadFilterNode;
                }
            };
        };
    };

    const DEFAULT_OPTIONS$5 = {
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        numberOfInputs: 6
    };
    const createChannelMergerNodeConstructor = (createChannelMergerNodeRenderer, createNativeChannelMergerNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class ChannelMergerNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS$5) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS$5, options);
                const nativeChannelMergerNode = createNativeChannelMergerNode(nativeContext, mergedOptions);
                const channelMergerNodeRenderer = (isNativeOfflineAudioContext(nativeContext)) ? createChannelMergerNodeRenderer() : null;
                super(context, nativeChannelMergerNode, channelMergerNodeRenderer);
            }
        };
    };

    const createChannelMergerNodeRendererFactory = (createNativeChannelMergerNode) => {
        return () => {
            let nativeAudioNode = null;
            return {
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeAudioNode !== null) {
                        return nativeAudioNode;
                    }
                    nativeAudioNode = getNativeAudioNode(proxy);
                    // If the initially used nativeAudioNode was not constructed on the same OfflineAudioContext it needs to be created again.
                    if (!isOwnedByContext(nativeAudioNode, nativeOfflineAudioContext)) {
                        const options = {
                            channelCount: nativeAudioNode.channelCount,
                            channelCountMode: nativeAudioNode.channelCountMode,
                            channelInterpretation: nativeAudioNode.channelInterpretation,
                            numberOfInputs: nativeAudioNode.numberOfInputs
                        };
                        nativeAudioNode = createNativeChannelMergerNode(nativeOfflineAudioContext, options);
                    }
                    await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeAudioNode);
                    return nativeAudioNode;
                }
            };
        };
    };

    const DEFAULT_OPTIONS$6 = {
        channelCount: 6,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
        numberOfOutputs: 6
    };
    const sanitizedOptions$1 = (options) => {
        return Object.assign({}, options, { channelCount: options.numberOfOutputs });
    };
    const createChannelSplitterNodeConstructor = (createChannelSplitterNodeRenderer, createNativeChannelSplitterNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class ChannelSplitterNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS$6) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = sanitizedOptions$1(Object.assign({}, DEFAULT_OPTIONS$6, options));
                const nativeChannelSplitterNode = createNativeChannelSplitterNode(nativeContext, mergedOptions);
                const channelSplitterNodeRenderer = (isNativeOfflineAudioContext(nativeContext)) ? createChannelSplitterNodeRenderer() : null;
                super(context, nativeChannelSplitterNode, channelSplitterNodeRenderer);
            }
        };
    };

    const createChannelSplitterNodeRendererFactory = (createNativeChannelSplitterNode) => {
        return () => {
            let nativeAudioNode = null;
            return {
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeAudioNode !== null) {
                        return nativeAudioNode;
                    }
                    nativeAudioNode = getNativeAudioNode(proxy);
                    // If the initially used nativeAudioNode was not constructed on the same OfflineAudioContext it needs to be created again.
                    if (!isOwnedByContext(nativeAudioNode, nativeOfflineAudioContext)) {
                        const options = {
                            channelCount: nativeAudioNode.channelCount,
                            channelCountMode: nativeAudioNode.channelCountMode,
                            channelInterpretation: nativeAudioNode.channelInterpretation,
                            numberOfOutputs: nativeAudioNode.numberOfOutputs
                        };
                        nativeAudioNode = createNativeChannelSplitterNode(nativeOfflineAudioContext, options);
                    }
                    await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeAudioNode);
                    return nativeAudioNode;
                }
            };
        };
    };

    const DEFAULT_OPTIONS$7 = {
        channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers',
        offset: 1
    };
    const createConstantSourceNodeConstructor = (createAudioParam, createConstantSourceNodeRendererFactory, createNativeConstantSourceNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class ConstantSourceNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS$7) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS$7, options);
                const nativeConstantSourceNode = createNativeConstantSourceNode(nativeContext, mergedOptions);
                const isOffline = isNativeOfflineAudioContext(nativeContext);
                const constantSourceNodeRenderer = (isOffline) ? createConstantSourceNodeRendererFactory() : null;
                super(context, nativeConstantSourceNode, constantSourceNodeRenderer);
                this._constantSourceNodeRenderer = constantSourceNodeRenderer;
                this._nativeConstantSourceNode = nativeConstantSourceNode;
                /*
                 * Bug #62 & #74: Edge & Safari do not support ConstantSourceNodes and do not export the correct values for maxValue and
                 * minValue for GainNodes.
                 */
                this._offset = createAudioParam(context, isOffline, nativeConstantSourceNode.offset, 3.4028234663852886e38, -3.4028234663852886e38);
            }
            get offset() {
                return this._offset;
            }
            get onended() {
                return this._nativeConstantSourceNode.onended;
            }
            set onended(value) {
                this._nativeConstantSourceNode.onended = value;
            }
            start(when = 0) {
                this._nativeConstantSourceNode.start(when);
                if (this._constantSourceNodeRenderer !== null) {
                    this._constantSourceNodeRenderer.start = when;
                }
            }
            stop(when = 0) {
                this._nativeConstantSourceNode.stop(when);
                if (this._constantSourceNodeRenderer !== null) {
                    this._constantSourceNodeRenderer.stop = when;
                }
            }
        };
    };

    const createConstantSourceNodeRendererFactory = (createNativeConstantSourceNode) => {
        return () => {
            let nativeConstantSourceNode = null;
            let start = null;
            let stop = null;
            return {
                set start(value) {
                    start = value;
                },
                set stop(value) {
                    stop = value;
                },
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeConstantSourceNode !== null) {
                        return nativeConstantSourceNode;
                    }
                    nativeConstantSourceNode = getNativeAudioNode(proxy);
                    /*
                     * If the initially used nativeConstantSourceNode was not constructed on the same OfflineAudioContext it needs to be
                     * created again.
                     */
                    if (!isOwnedByContext(nativeConstantSourceNode, nativeOfflineAudioContext)) {
                        const options = {
                            channelCount: nativeConstantSourceNode.channelCount,
                            channelCountMode: nativeConstantSourceNode.channelCountMode,
                            channelInterpretation: nativeConstantSourceNode.channelInterpretation,
                            offset: nativeConstantSourceNode.offset.value
                        };
                        nativeConstantSourceNode = createNativeConstantSourceNode(nativeOfflineAudioContext, options);
                        if (start !== null) {
                            nativeConstantSourceNode.start(start);
                        }
                        if (stop !== null) {
                            nativeConstantSourceNode.stop(stop);
                        }
                        await renderAutomation(proxy.context, nativeOfflineAudioContext, proxy.offset, nativeConstantSourceNode.offset);
                    }
                    else {
                        await connectAudioParam(proxy.context, nativeOfflineAudioContext, proxy.offset);
                    }
                    await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeConstantSourceNode);
                    return nativeConstantSourceNode;
                }
            };
        };
    };

    const createDataCloneError = () => {
        try {
            return new DOMException('', 'DataCloneError');
        }
        catch (err) {
            err.code = 25;
            err.name = 'DataCloneError';
            return err;
        }
    };

    const createDecodeAudioData = (createDataCloneError, createEncodingError, nativeOfflineAudioContextConstructor, isNativeOfflineAudioContext, testAudioBufferCopyChannelMethodsSubarraySupport, testPromiseSupport) => {
        return (nativeContext, audioData) => {
            // Bug #43: Only Chrome and Opera do throw a DataCloneError.
            if (DETACHED_ARRAY_BUFFERS.has(audioData)) {
                const err = createDataCloneError();
                return Promise.reject(err);
            }
            // The audioData parameter maybe of a type which can't be added to a WeakSet.
            try {
                DETACHED_ARRAY_BUFFERS.add(audioData);
            }
            catch (_a) {
                // Ignore errors.
            }
            // Bug #21: Safari does not support promises yet.
            if (cacheTestResult(testPromiseSupport, () => testPromiseSupport(nativeContext))) {
                // Bug #101: Edge does not decode something on a closed OfflineAudioContext.
                const nativeContextOrBackupNativeContext = (nativeContext.state === 'closed' &&
                    nativeOfflineAudioContextConstructor !== null &&
                    isNativeOfflineAudioContext(nativeContext)) ?
                    new nativeOfflineAudioContextConstructor(1, 1, nativeContext.sampleRate) :
                    nativeContext;
                const promise = nativeContextOrBackupNativeContext
                    .decodeAudioData(audioData)
                    .catch((err) => {
                    // Bug #27: Edge is rejecting invalid arrayBuffers with a DOMException.
                    if (err instanceof DOMException && err.name === 'NotSupportedError') {
                        throw new TypeError();
                    }
                    throw err;
                });
                setTimeout(() => {
                    try {
                        deallocate(audioData);
                    }
                    catch ( /* Ignore errors. */_a) { /* Ignore errors. */ }
                });
                return promise
                    .then((audioBuffer) => {
                    // Bug #42: Firefox does not yet fully support copyFromChannel() and copyToChannel().
                    if (!cacheTestResult(testAudioBufferCopyChannelMethodsSubarraySupport, () => testAudioBufferCopyChannelMethodsSubarraySupport(audioBuffer))) {
                        wrapAudioBufferCopyChannelMethodsSubarray(audioBuffer);
                    }
                    return audioBuffer;
                });
            }
            // Bug #21: Safari does not return a Promise yet.
            return new Promise((resolve, reject) => {
                const complete = () => {
                    try {
                        deallocate(audioData);
                    }
                    catch ( /* Ignore errors. */_a) { /* Ignore errors. */ }
                };
                const fail = (err) => {
                    reject(err);
                    complete();
                };
                const succeed = (dBffrWrppr) => {
                    resolve(dBffrWrppr);
                    complete();
                };
                // Bug #26: Safari throws a synchronous error.
                try {
                    // Bug #1: Safari requires a successCallback.
                    nativeContext.decodeAudioData(audioData, (audioBuffer) => {
                        // Bug #5: Safari does not support copyFromChannel() and copyToChannel().
                        // Bug #100: Safari does throw a wrong error when calling getChannelData() with an out-of-bounds value.
                        if (typeof audioBuffer.copyFromChannel !== 'function') {
                            wrapAudioBufferCopyChannelMethods(audioBuffer);
                            wrapAudioBufferGetChannelDataMethod(audioBuffer);
                        }
                        succeed(audioBuffer);
                    }, (err) => {
                        // Bug #4: Safari returns null instead of an error.
                        if (err === null) {
                            fail(createEncodingError());
                        }
                        else {
                            fail(err);
                        }
                    });
                }
                catch (err) {
                    fail(err);
                }
            });
        };
    };

    const createEncodingError = () => {
        try {
            return new DOMException('', 'EncodingError');
        }
        catch (err) {
            err.code = 0;
            err.name = 'EncodingError';
            return err;
        }
    };

    const createFetchSource = (createAbortError) => {
        return async (url) => {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    return response.text();
                }
            }
            catch ( /* Ignore errors. */_a) { /* Ignore errors. */ } // tslint:disable-line:no-empty
            throw createAbortError();
        };
    };

    const DEFAULT_OPTIONS$8 = {
        channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers',
        gain: 1
    };
    const createGainNodeConstructor = (createAudioParam, createGainNodeRenderer, createNativeGainNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class GainNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS$8) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS$8, options);
                const nativeGainNode = createNativeGainNode(nativeContext, mergedOptions);
                const isOffline = isNativeOfflineAudioContext(nativeContext);
                const gainNodeRenderer = (isOffline) ? createGainNodeRenderer() : null;
                super(context, nativeGainNode, gainNodeRenderer);
                // Bug #74: Edge & Safari do not export the correct values for maxValue and minValue.
                this._gain = createAudioParam(context, isOffline, nativeGainNode.gain, 3.4028234663852886e38, -3.4028234663852886e38);
            }
            get gain() {
                return this._gain;
            }
        };
    };

    const createGainNodeRendererFactory = (createNativeGainNode) => {
        return () => {
            let nativeGainNode = null;
            return {
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeGainNode !== null) {
                        return nativeGainNode;
                    }
                    nativeGainNode = getNativeAudioNode(proxy);
                    // If the initially used nativeGainNode was not constructed on the same OfflineAudioContext it needs to be created again.
                    if (!isOwnedByContext(nativeGainNode, nativeOfflineAudioContext)) {
                        const options = {
                            channelCount: nativeGainNode.channelCount,
                            channelCountMode: nativeGainNode.channelCountMode,
                            channelInterpretation: nativeGainNode.channelInterpretation,
                            gain: nativeGainNode.gain.value
                        };
                        nativeGainNode = createNativeGainNode(nativeOfflineAudioContext, options);
                        await renderAutomation(proxy.context, nativeOfflineAudioContext, proxy.gain, nativeGainNode.gain);
                    }
                    else {
                        await connectAudioParam(proxy.context, nativeOfflineAudioContext, proxy.gain);
                    }
                    await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeGainNode);
                    return nativeGainNode;
                }
            };
        };
    };

    const createGetBackupNativeContext = (isNativeOfflineAudioContext, nativeAudioContextConstructor, nativeOfflineAudioContextConstructor) => {
        return (nativeContext) => {
            /*
             * Bug #50: Only Safari does currently allow to create AudioNodes on a closed context yet which is why there needs to be no
             * backupNativeContext in that case.
             */
            if (nativeContext.state === 'closed' && !window.hasOwnProperty('webkitAudioContext')) {
                if (isNativeOfflineAudioContext(nativeContext)) {
                    const backupNativeContext = BACKUP_NATIVE_CONTEXT_STORE.get(nativeContext);
                    if (backupNativeContext !== undefined) {
                        return backupNativeContext;
                    }
                    if (nativeOfflineAudioContextConstructor !== null) {
                        // @todo Copy the attached AudioWorkletProcessors and other settings.
                        const bckpNtveCntxt = new nativeOfflineAudioContextConstructor(1, 1, 44100);
                        BACKUP_NATIVE_CONTEXT_STORE.set(nativeContext, bckpNtveCntxt);
                        return bckpNtveCntxt;
                    }
                }
                else {
                    const backupNativeContext = BACKUP_NATIVE_CONTEXT_STORE.get(nativeContext);
                    if (backupNativeContext !== undefined) {
                        return backupNativeContext;
                    }
                    if (nativeAudioContextConstructor !== null) {
                        // @todo Copy the attached AudioWorkletProcessors and other settings.
                        const bckpNtveCntxt = new nativeAudioContextConstructor();
                        BACKUP_NATIVE_CONTEXT_STORE.set(nativeContext, bckpNtveCntxt);
                        return bckpNtveCntxt;
                    }
                }
            }
            return null;
        };
    };

    const createInvalidAccessError = () => {
        try {
            return new DOMException('', 'InvalidAccessError');
        }
        catch (err) {
            err.code = 15;
            err.name = 'InvalidAccessError';
            return err;
        }
    };

    const wrapIIRFilterNodeGetFrequencyResponseMethod = (nativeIIRFilterNode) => {
        nativeIIRFilterNode.getFrequencyResponse = ((getFrequencyResponse) => {
            return (frequencyHz, magResponse, phaseResponse) => {
                if ((frequencyHz.length !== magResponse.length) || (magResponse.length !== phaseResponse.length)) {
                    throw createInvalidAccessError();
                }
                return getFrequencyResponse.call(nativeIIRFilterNode, frequencyHz, magResponse, phaseResponse);
            };
        })(nativeIIRFilterNode.getFrequencyResponse);
    };

    // The DEFAULT_OPTIONS are only of type Partial<IIIRFilterOptions> because there are no default values for feedback and feedforward.
    const DEFAULT_OPTIONS$9 = {
        channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers'
    };
    const createIIRFilterNodeConstructor = (createNativeIIRFilterNode, createIIRFilterNodeRenderer, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class IIRFilterNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS$9, options);
                const nativeIIRFilterNode = createNativeIIRFilterNode(nativeContext, mergedOptions);
                const iirFilterNodeRenderer = (isNativeOfflineAudioContext(nativeContext)) ?
                    createIIRFilterNodeRenderer(mergedOptions.feedback, mergedOptions.feedforward) :
                    null;
                super(context, nativeIIRFilterNode, iirFilterNodeRenderer);
                // Bug #23 & #24: FirefoxDeveloper does not throw an InvalidAccessError.
                // @todo Write a test which allows other browsers to remain unpatched.
                wrapIIRFilterNodeGetFrequencyResponseMethod(nativeIIRFilterNode);
                this._nativeIIRFilterNode = nativeIIRFilterNode;
            }
            getFrequencyResponse(frequencyHz, magResponse, phaseResponse) {
                return this._nativeIIRFilterNode.getFrequencyResponse(frequencyHz, magResponse, phaseResponse);
            }
        };
    };

    // This implementation as shamelessly inspired by source code of
    // tslint:disable-next-line:max-line-length
    // {@link https://chromium.googlesource.com/chromium/src.git/+/master/third_party/WebKit/Source/platform/audio/IIRFilter.cpp|Chromium's IIRFilter}.
    const filterBuffer = (feedback, feedbackLength, feedforward, feedforwardLength, minLength, xBuffer, yBuffer, bufferIndex, bufferLength, input, output) => {
        const inputLength = input.length;
        let i = bufferIndex;
        for (let j = 0; j < inputLength; j += 1) {
            let y = feedforward[0] * input[j];
            for (let k = 1; k < minLength; k += 1) {
                const x = (i - k) & (bufferLength - 1); // tslint:disable-line:no-bitwise
                y += feedforward[k] * xBuffer[x];
                y -= feedback[k] * yBuffer[x];
            }
            for (let k = minLength; k < feedforwardLength; k += 1) {
                y += feedforward[k] * xBuffer[(i - k) & (bufferLength - 1)]; // tslint:disable-line:no-bitwise
            }
            for (let k = minLength; k < feedbackLength; k += 1) {
                y -= feedback[k] * yBuffer[(i - k) & (bufferLength - 1)]; // tslint:disable-line:no-bitwise
            }
            xBuffer[i] = input[j];
            yBuffer[i] = y;
            i = (i + 1) & (bufferLength - 1); // tslint:disable-line:no-bitwise
            output[j] = y;
        }
        return i;
    };

    const filterFullBuffer = (renderedBuffer, nativeOfflineAudioContext, feedback, feedforward) => {
        const feedbackLength = feedback.length;
        const feedforwardLength = feedforward.length;
        const minLength = Math.min(feedbackLength, feedforwardLength);
        if (feedback[0] !== 1) {
            for (let i = 0; i < feedbackLength; i += 1) {
                feedforward[i] /= feedback[0];
            }
            for (let i = 1; i < feedforwardLength; i += 1) {
                feedback[i] /= feedback[0];
            }
        }
        const bufferLength = 32;
        const xBuffer = new Float32Array(bufferLength);
        const yBuffer = new Float32Array(bufferLength);
        const filteredBuffer = nativeOfflineAudioContext.createBuffer(renderedBuffer.numberOfChannels, renderedBuffer.length, renderedBuffer.sampleRate);
        const numberOfChannels = renderedBuffer.numberOfChannels;
        for (let i = 0; i < numberOfChannels; i += 1) {
            const input = renderedBuffer.getChannelData(i);
            const output = filteredBuffer.getChannelData(i);
            // @todo Add a test which checks support for TypedArray.prototype.fill().
            xBuffer.fill(0);
            yBuffer.fill(0);
            filterBuffer(feedback, feedbackLength, feedforward, feedforwardLength, minLength, xBuffer, yBuffer, 0, bufferLength, input, output);
        }
        return filteredBuffer;
    };
    const createIIRFilterNodeRendererFactory = (createNativeAudioBufferSourceNode, createNativeAudioNode, nativeOfflineAudioContextConstructor, renderNativeOfflineAudioContext) => {
        return (feedback, feedforward) => {
            let nativeAudioNode = null;
            return {
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeAudioNode !== null) {
                        return nativeAudioNode;
                    }
                    if (nativeOfflineAudioContextConstructor === null) {
                        throw new Error(); // @todo
                    }
                    nativeAudioNode = getNativeAudioNode(proxy);
                    // Bug #9: Safari does not support IIRFilterNodes.
                    if (nativeOfflineAudioContext.createIIRFilter === undefined) {
                        const partialOfflineAudioContext = new nativeOfflineAudioContextConstructor(
                        // Bug #47: The AudioDestinationNode in Edge and Safari gets not initialized correctly.
                        proxy.context.destination.channelCount, 
                        // Bug #17: Safari does not yet expose the length.
                        proxy.context.length, nativeOfflineAudioContext.sampleRate);
                        await renderInputsOfAudioNode(proxy, partialOfflineAudioContext, partialOfflineAudioContext.destination);
                        const renderedBuffer = await renderNativeOfflineAudioContext(partialOfflineAudioContext);
                        const audioBufferSourceNode = createNativeAudioBufferSourceNode(nativeOfflineAudioContext);
                        audioBufferSourceNode.buffer = filterFullBuffer(renderedBuffer, nativeOfflineAudioContext, feedback, feedforward);
                        audioBufferSourceNode.start(0);
                        nativeAudioNode = audioBufferSourceNode;
                        return nativeAudioNode;
                    }
                    else {
                        /*
                         * If the initially used nativeAudioNode was not constructed on the same OfflineAudioContext it needs to be created
                         * again.
                         */
                        if (!isOwnedByContext(nativeAudioNode, nativeOfflineAudioContext)) {
                            nativeAudioNode = createNativeAudioNode(nativeOfflineAudioContext, (ntvCntxt) => {
                                return ntvCntxt.createIIRFilter(feedforward, feedback);
                            });
                        }
                        await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeAudioNode);
                        return nativeAudioNode;
                    }
                }
            };
        };
    };

    const createIsNativeOfflineAudioContext = (nativeOfflineAudioContextConstructor) => {
        return (nativeContext) => {
            if (nativeOfflineAudioContextConstructor === null) {
                throw new Error('The native OfflineAudioContext constructor is missing.');
            }
            return nativeContext instanceof nativeOfflineAudioContextConstructor;
        };
    };

    const createIsSecureContext = (window) => (window !== null && window.isSecureContext);

    const createMinimalBaseAudioContextConstructor = (audioDestinationNodeConstructor) => {
        return class MinimalBaseAudioContext extends EventTarget {
            constructor(nativeContext, numberOfChannels) {
                super();
                CONTEXT_STORE.set(this, nativeContext);
                // Bug #93: Edge will set the sampleRate of an AudioContext to zero when it is closed.
                const sampleRate = nativeContext.sampleRate;
                Object.defineProperty(nativeContext, 'sampleRate', {
                    get: () => sampleRate
                });
                this._nativeContext = nativeContext;
                this._destination = new audioDestinationNodeConstructor(this, numberOfChannels);
            }
            get currentTime() {
                return this._nativeContext.currentTime;
            }
            get destination() {
                return this._destination;
            }
            get onstatechange() {
                return this._nativeContext.onstatechange;
            }
            set onstatechange(value) {
                this._nativeContext.onstatechange = value;
            }
            get sampleRate() {
                return this._nativeContext.sampleRate;
            }
            get state() {
                return this._nativeContext.state;
            }
        };
    };

    const testPromiseSupport = (nativeContext) => {
        // This 12 numbers represent the 48 bytes of an empty WAVE file with a single sample.
        const uint32Array = new Uint32Array([
            1179011410,
            40,
            1163280727,
            544501094,
            16,
            131073,
            44100,
            176400,
            1048580,
            1635017060,
            4,
            0
        ]);
        try {
            // Bug #1: Safari requires a successCallback.
            const promise = nativeContext.decodeAudioData(uint32Array.buffer, () => {
                // Ignore the success callback.
            });
            if (promise === undefined) {
                return false;
            }
            promise.catch(() => {
                // Ignore rejected errors.
            });
            return true;
        }
        catch (_a) {
            // Ignore errors.
        }
        return false;
    };

    // @todo Use the same strategy to assign all node specific options as well.
    const assignNativeAudioNodeOption = (nativeAudioNode, options, option) => {
        const value = options[option];
        if (value !== undefined && value !== nativeAudioNode[option]) {
            nativeAudioNode[option] = value;
        }
    };
    const assignNativeAudioNodeOptions = (nativeAudioNode, options = {}) => {
        assignNativeAudioNodeOption(nativeAudioNode, options, 'channelCount');
        assignNativeAudioNodeOption(nativeAudioNode, options, 'channelCountMode');
        assignNativeAudioNodeOption(nativeAudioNode, options, 'channelInterpretation');
    };

    const testAnalyserNodeGetFloatTimeDomainDataMethodSupport = (nativeAnalyserNode) => {
        return typeof nativeAnalyserNode.getFloatTimeDomainData === 'function';
    };

    const wrapAnalyserNodeGetFloatTimeDomainDataMethod = (nativeAnalyserNode) => {
        nativeAnalyserNode.getFloatTimeDomainData = (array) => {
            const byteTimeDomainData = new Uint8Array(array.length);
            nativeAnalyserNode.getByteTimeDomainData(byteTimeDomainData);
            const length = Math.max(byteTimeDomainData.length, nativeAnalyserNode.fftSize);
            for (let i = 0; i < length; i += 1) {
                array[i] = (byteTimeDomainData[i] - 128) * 0.0078125;
            }
            return array;
        };
    };

    const createNativeAnalyserNodeFactory = (createNativeAudioNode) => {
        return (nativeContext, options) => {
            const nativeAnalyserNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createAnalyser());
            assignNativeAudioNodeOptions(nativeAnalyserNode, options);
            if (options.fftSize !== nativeAnalyserNode.fftSize) {
                nativeAnalyserNode.fftSize = options.fftSize;
            }
            if (options.maxDecibels !== nativeAnalyserNode.maxDecibels) {
                nativeAnalyserNode.maxDecibels = options.maxDecibels;
            }
            if (options.minDecibels !== nativeAnalyserNode.minDecibels) {
                nativeAnalyserNode.minDecibels = options.minDecibels;
            }
            if (options.smoothingTimeConstant !== nativeAnalyserNode.smoothingTimeConstant) {
                nativeAnalyserNode.smoothingTimeConstant = options.smoothingTimeConstant;
            }
            // Bug #37: Only Edge and Safari create an AnalyserNode with the default properties.
            if (nativeAnalyserNode.channelCount === 1) {
                nativeAnalyserNode.channelCount = 2;
            }
            // Bug #36: Safari does not support getFloatTimeDomainData() yet.
            if (!cacheTestResult(testAnalyserNodeGetFloatTimeDomainDataMethodSupport, () => testAnalyserNodeGetFloatTimeDomainDataMethodSupport(nativeAnalyserNode))) {
                wrapAnalyserNodeGetFloatTimeDomainDataMethod(nativeAnalyserNode);
            }
            return nativeAnalyserNode;
        };
    };

    const createNativeAudioBufferConstructor = (window) => {
        if (window === null) {
            return null;
        }
        if (window.hasOwnProperty('AudioBuffer')) {
            // @todo TypeScript doesn't know yet about the AudioBuffer constructor.
            return window.AudioBuffer;
        }
        return null;
    };

    const wrapAudioBufferSourceNodeStartMethodConsecutiveCalls = (nativeAudioBufferSourceNode) => {
        nativeAudioBufferSourceNode.start = ((start) => {
            let isScheduled = false;
            return (when = 0, offset = 0, duration) => {
                if (isScheduled) {
                    throw createInvalidStateError();
                }
                start.call(nativeAudioBufferSourceNode, when, offset, duration);
                isScheduled = true;
            };
        })(nativeAudioBufferSourceNode.start);
    };

    const wrapAudioBufferSourceNodeStartMethodDurationParameter = (nativeAudioScheduledSourceNode, nativeContext) => {
        let endTime = Number.POSITIVE_INFINITY;
        let stopTime = Number.POSITIVE_INFINITY;
        nativeAudioScheduledSourceNode.start = ((start, stop) => {
            return (when = 0, offset = 0, duration = Number.POSITIVE_INFINITY) => {
                start.call(nativeAudioScheduledSourceNode, when, offset);
                if (duration >= 0 && duration < Number.POSITIVE_INFINITY) {
                    const actualStartTime = Math.max(when, nativeContext.currentTime);
                    // @todo The playbackRate could of course also have been automated and is not always fixed.
                    const durationInBufferTime = (duration / nativeAudioScheduledSourceNode.playbackRate.value);
                    endTime = actualStartTime + durationInBufferTime;
                    stop.call(nativeAudioScheduledSourceNode, Math.min(endTime, stopTime));
                }
            };
        })(nativeAudioScheduledSourceNode.start, nativeAudioScheduledSourceNode.stop);
        nativeAudioScheduledSourceNode.stop = ((stop) => {
            return (when = 0) => {
                stopTime = Math.max(when, nativeContext.currentTime);
                stop.call(nativeAudioScheduledSourceNode, Math.min(endTime, stopTime));
            };
        })(nativeAudioScheduledSourceNode.stop);
    };

    const wrapAudioScheduledSourceNodeStartMethodNegativeParameters = (nativeAudioScheduledSourceNode) => {
        nativeAudioScheduledSourceNode.start = ((start) => {
            return (when = 0, offset = 0, duration) => {
                if ((typeof duration === 'number' && duration < 0) || offset < 0 || when < 0) {
                    throw new RangeError("The parameters can't be negative.");
                }
                start.call(nativeAudioScheduledSourceNode, when, offset, duration);
            };
        })(nativeAudioScheduledSourceNode.start);
    };

    const wrapAudioScheduledSourceNodeStopMethodNegativeParameters = (nativeAudioScheduledSourceNode) => {
        nativeAudioScheduledSourceNode.stop = ((stop) => {
            return (when = 0) => {
                if (when < 0) {
                    throw new RangeError("The parameter can't be negative.");
                }
                stop.call(nativeAudioScheduledSourceNode, when);
            };
        })(nativeAudioScheduledSourceNode.stop);
    };

    const createNativeAudioBufferSourceNodeFactory = (createNativeAudioNode, testAudioBufferSourceNodeStartMethodConsecutiveCallsSupport, testAudioBufferSourceNodeStartMethodDurationParameterSupport, testAudioScheduledSourceNodeStartMethodNegativeParametersSupport, testAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport, testAudioScheduledSourceNodeStopMethodNegativeParametersSupport, wrapAudioScheduledSourceNodeStopMethodConsecutiveCalls) => {
        return (nativeContext, options = {}) => {
            const nativeAudioBufferSourceNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createBufferSource());
            assignNativeAudioNodeOptions(nativeAudioBufferSourceNode, options);
            // Bug #71: Edge does not allow to set the buffer to null.
            if (options.buffer !== undefined && options.buffer !== null) {
                nativeAudioBufferSourceNode.buffer = options.buffer;
            }
            // @todo if (options.detune !== undefined) {
            // @todo    nativeAudioBufferSourceNode.detune.value = options.detune;
            // @todo }
            if (options.loop !== undefined) {
                nativeAudioBufferSourceNode.loop = options.loop;
            }
            if (options.loopEnd !== undefined) {
                nativeAudioBufferSourceNode.loopEnd = options.loopEnd;
            }
            if (options.loopStart !== undefined) {
                nativeAudioBufferSourceNode.loopStart = options.loopStart;
            }
            if (options.playbackRate !== undefined) {
                nativeAudioBufferSourceNode.playbackRate.value = options.playbackRate;
            }
            // Bug #69: Safari does allow calls to start() of an already scheduled AudioBufferSourceNode.
            if (!cacheTestResult(testAudioBufferSourceNodeStartMethodConsecutiveCallsSupport, () => testAudioBufferSourceNodeStartMethodConsecutiveCallsSupport(nativeContext))) {
                wrapAudioBufferSourceNodeStartMethodConsecutiveCalls(nativeAudioBufferSourceNode);
            }
            // Bug #92: Edge does not respect the duration parameter yet.
            if (!cacheTestResult(testAudioBufferSourceNodeStartMethodDurationParameterSupport, () => testAudioBufferSourceNodeStartMethodDurationParameterSupport())) {
                wrapAudioBufferSourceNodeStartMethodDurationParameter(nativeAudioBufferSourceNode, nativeContext);
            }
            // Bug #44: Only Chrome & Opera throw a RangeError yet.
            if (!cacheTestResult(testAudioScheduledSourceNodeStartMethodNegativeParametersSupport, () => testAudioScheduledSourceNodeStartMethodNegativeParametersSupport(nativeContext))) {
                wrapAudioScheduledSourceNodeStartMethodNegativeParameters(nativeAudioBufferSourceNode);
            }
            // Bug #19: Safari does not ignore calls to stop() of an already stopped AudioBufferSourceNode.
            if (!cacheTestResult(testAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport, () => testAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport(nativeContext))) {
                wrapAudioScheduledSourceNodeStopMethodConsecutiveCalls(nativeAudioBufferSourceNode, nativeContext);
            }
            // Bug #44: No browser does throw a RangeError yet.
            if (!cacheTestResult(testAudioScheduledSourceNodeStopMethodNegativeParametersSupport, () => testAudioScheduledSourceNodeStopMethodNegativeParametersSupport(nativeContext))) {
                wrapAudioScheduledSourceNodeStopMethodNegativeParameters(nativeAudioBufferSourceNode);
            }
            return nativeAudioBufferSourceNode;
        };
    };

    const createNativeAudioContextConstructor = (window) => {
        if (window === null) {
            return null;
        }
        if (window.hasOwnProperty('AudioContext')) {
            return window.AudioContext;
        }
        return (window.hasOwnProperty('webkitAudioContext')) ? window.webkitAudioContext : null;
    };

    const createNativeAudioDestinationNode = (nativeContext, channelCount, isNodeOfNativeOfflineAudioContext) => {
        const nativeAudioDestinationNode = nativeContext.destination;
        // @todo Which bug is that covering?
        if (nativeAudioDestinationNode.channelCount !== channelCount) {
            nativeAudioDestinationNode.channelCount = channelCount;
        }
        // Bug #83: Edge & Safari do not have the correct channelCountMode.
        if (isNodeOfNativeOfflineAudioContext && nativeAudioDestinationNode.channelCountMode !== 'explicit') {
            nativeAudioDestinationNode.channelCountMode = 'explicit';
        }
        // Bug #47: The AudioDestinationNode in Edge and Safari do not initialize the maxChannelCount property correctly.
        if (nativeAudioDestinationNode.maxChannelCount === 0) {
            Object.defineProperty(nativeAudioDestinationNode, 'maxChannelCount', {
                get: () => nativeAudioDestinationNode.channelCount
            });
        }
        return nativeAudioDestinationNode;
    };

    const createNativeAudioNodeFactory = (getBackupNativeContext) => {
        return (nativeContext, factoryFunction) => {
            // Bug #50: Only Safari does currently allow to create AudioNodes on a closed context yet.
            const backupNativeContext = getBackupNativeContext(nativeContext);
            if (backupNativeContext !== null) {
                return factoryFunction(backupNativeContext);
            }
            return factoryFunction(nativeContext);
        };
    };

    const createNativeAudioWorkletNodeConstructor = (window) => {
        if (window === null) {
            return null;
        }
        // @todo TypeScript doesn't know yet about the AudioWorkletNode constructor.
        return (window.hasOwnProperty('AudioWorkletNode')) ? window.AudioWorkletNode : null;
    };

    const createNativeBiquadFilterNodeFactory = (createNativeAudioNode) => {
        return (nativeContext, options) => {
            const nativeBiquadFilterNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createBiquadFilter());
            assignNativeAudioNodeOptions(nativeBiquadFilterNode, options);
            if (options.Q !== nativeBiquadFilterNode.Q.value) {
                nativeBiquadFilterNode.Q.value = options.Q;
            }
            if (options.detune !== nativeBiquadFilterNode.detune.value) {
                nativeBiquadFilterNode.detune.value = options.detune;
            }
            if (options.frequency !== nativeBiquadFilterNode.frequency.value) {
                nativeBiquadFilterNode.frequency.value = options.frequency;
            }
            if (options.gain !== nativeBiquadFilterNode.gain.value) {
                nativeBiquadFilterNode.gain.value = options.gain;
            }
            if (options.type !== nativeBiquadFilterNode.type) {
                nativeBiquadFilterNode.type = options.type;
            }
            return nativeBiquadFilterNode;
        };
    };

    const createNativeChannelMergerNodeFactory = (createNativeAudioNode, wrapChannelMergerNode) => {
        return (nativeContext, options = {}) => {
            const nativeChannelMergerNode = createNativeAudioNode(nativeContext, (ntvCntxt) => {
                return ntvCntxt.createChannelMerger((options.numberOfInputs === undefined) ? 6 : options.numberOfInputs);
            });
            assignNativeAudioNodeOptions(nativeChannelMergerNode, options);
            // Bug #15: Safari does not return the default properties.
            if (nativeChannelMergerNode.channelCount !== 1 &&
                nativeChannelMergerNode.channelCountMode !== 'explicit') {
                wrapChannelMergerNode(nativeContext, nativeChannelMergerNode);
            }
            // Bug #16: Firefox does not throw an error when setting a different channelCount or channelCountMode.
            try {
                nativeChannelMergerNode.channelCount = (options.numberOfInputs === undefined) ? 6 : options.numberOfInputs;
                wrapChannelMergerNode(nativeContext, nativeChannelMergerNode);
            }
            catch ( /* Ignore errors. */_a) { /* Ignore errors. */ } // tslint:disable-line:no-empty
            return nativeChannelMergerNode;
        };
    };

    const wrapChannelSplitterNode = (channelSplitterNode) => {
        const channelCount = channelSplitterNode.numberOfOutputs;
        // Bug #96: Safari does not have the correct channelCount.
        if (channelSplitterNode.channelCount !== channelCount) {
            channelSplitterNode.channelCount = channelCount;
        }
        // Bug #29: Edge & Safari do not have the correct channelCountMode.
        if (channelSplitterNode.channelCountMode !== 'explicit') {
            channelSplitterNode.channelCountMode = 'explicit';
        }
        // Bug #31: Edge & Safari do not have the correct channelInterpretation.
        if (channelSplitterNode.channelInterpretation !== 'discrete') {
            channelSplitterNode.channelInterpretation = 'discrete';
        }
        // Bug #97: Safari does not throw an error when attempting to change the channelCount to something other than its initial value.
        Object.defineProperty(channelSplitterNode, 'channelCount', {
            get: () => channelCount,
            set: (value) => {
                if (value !== channelCount) {
                    throw createInvalidStateError();
                }
            }
        });
        /*
         * Bug #30: Only Chrome, Firefox & Opera throw an error when attempting to change the channelCountMode to something other than
         * explicit.
         */
        Object.defineProperty(channelSplitterNode, 'channelCountMode', {
            get: () => 'explicit',
            set: (value) => {
                if (value !== 'explicit') {
                    throw createInvalidStateError();
                }
            }
        });
        /*
         * Bug #32: Only Chrome, Firefox & Opera throws an error when attempting to change the channelInterpretation to something other than
         * discrete.
         */
        Object.defineProperty(channelSplitterNode, 'channelInterpretation', {
            get: () => 'discrete',
            set: (value) => {
                if (value !== 'discrete') {
                    throw createInvalidStateError();
                }
            }
        });
    };

    const createNativeChannelSplitterNodeFactory = (createNativeAudioNode) => {
        return (nativeContext, options) => {
            const nativeChannelSplitterNode = createNativeAudioNode(nativeContext, (ntvCntxt) => {
                return ntvCntxt.createChannelSplitter(options.numberOfOutputs);
            });
            // Bug #29, #30, #31, #32, #96 & #97: Only Chrome, Firefox & Opera partially support the spec yet.
            wrapChannelSplitterNode(nativeChannelSplitterNode);
            return nativeChannelSplitterNode;
        };
    };

    const createNativeConstantSourceNodeFactory = (createNativeAudioNode, createNativeConstantSourceNodeFaker, testAudioScheduledSourceNodeStartMethodNegativeParametersSupport, testAudioScheduledSourceNodeStopMethodNegativeParametersSupport) => {
        return (nativeContext, options) => {
            // Bug #62: Edge & Safari do not support ConstantSourceNodes.
            if (nativeContext.createConstantSource === undefined) {
                return createNativeConstantSourceNodeFaker(nativeContext, options);
            }
            const nativeConstantSourceNode = createNativeAudioNode(nativeContext, (ntvCntxt) => {
                return ntvCntxt.createConstantSource();
            });
            assignNativeAudioNodeOptions(nativeConstantSourceNode, options);
            if (options.offset !== nativeConstantSourceNode.offset.value) {
                nativeConstantSourceNode.offset.value = options.offset;
            }
            // Bug #44: Only Chrome & Opera throw a RangeError yet.
            if (!cacheTestResult(testAudioScheduledSourceNodeStartMethodNegativeParametersSupport, () => testAudioScheduledSourceNodeStartMethodNegativeParametersSupport(nativeContext))) {
                wrapAudioScheduledSourceNodeStartMethodNegativeParameters(nativeConstantSourceNode);
            }
            // Bug #44: No browser does throw a RangeError yet.
            if (!cacheTestResult(testAudioScheduledSourceNodeStopMethodNegativeParametersSupport, () => testAudioScheduledSourceNodeStopMethodNegativeParametersSupport(nativeContext))) {
                wrapAudioScheduledSourceNodeStopMethodNegativeParameters(nativeConstantSourceNode);
            }
            return nativeConstantSourceNode;
        };
    };

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    function __rest(s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
                t[p[i]] = s[p[i]];
        return t;
    }

    const interceptConnections = (original, interceptor) => {
        original.connect = ((destination, output = 0, input = 0) => {
            if (destination instanceof AudioNode) {
                interceptor.connect.call(interceptor, destination, output, input);
                // Bug #11: Safari does not support chaining yet.
                return destination;
            }
            // @todo This return statement is necessary to satisfy TypeScript.
            return interceptor.connect.call(interceptor, destination, output);
        });
        original.disconnect = function () {
            interceptor.disconnect.apply(interceptor, arguments);
        };
        return original;
    };

    const createNativeConstantSourceNodeFakerFactory = (createNativeAudioBufferSourceNode, createNativeGainNode) => {
        return (nativeContext, _a) => {
            var { offset } = _a, audioNodeOptions = __rest(_a, ["offset"]);
            const audioBufferSourceNode = createNativeAudioBufferSourceNode(nativeContext);
            /*
             * @todo Edge will throw a NotSupportedError when calling createBuffer() on a closed context. That's why the audioBuffer is created
             * after the audioBufferSourceNode in this case. If the context is closed createNativeAudioBufferSourceNode() will throw the
             * expected error and createBuffer() never gets called.
             */
            const audioBuffer = nativeContext.createBuffer(1, 2, nativeContext.sampleRate);
            const gainNode = createNativeGainNode(nativeContext, Object.assign({}, audioNodeOptions, { gain: offset }));
            // Bug #5: Safari does not support copyFromChannel() and copyToChannel().
            const channelData = audioBuffer.getChannelData(0);
            // Bug #95: Safari does not play or loop one sample buffers.
            channelData[0] = 1;
            channelData[1] = 1;
            audioBufferSourceNode.buffer = audioBuffer;
            audioBufferSourceNode.loop = true;
            audioBufferSourceNode.connect(gainNode);
            const nativeConstantSourceNodeFaker = {
                get bufferSize() {
                    return undefined;
                },
                get channelCount() {
                    return gainNode.channelCount;
                },
                set channelCount(value) {
                    gainNode.channelCount = value;
                },
                get channelCountMode() {
                    return gainNode.channelCountMode;
                },
                set channelCountMode(value) {
                    gainNode.channelCountMode = value;
                },
                get channelInterpretation() {
                    return gainNode.channelInterpretation;
                },
                set channelInterpretation(value) {
                    gainNode.channelInterpretation = value;
                },
                get context() {
                    return gainNode.context;
                },
                get inputs() {
                    return undefined;
                },
                get numberOfInputs() {
                    return audioBufferSourceNode.numberOfInputs;
                },
                get numberOfOutputs() {
                    return gainNode.numberOfOutputs;
                },
                get offset() {
                    return gainNode.gain;
                },
                get onended() {
                    return audioBufferSourceNode.onended;
                },
                set onended(value) {
                    audioBufferSourceNode.onended = value;
                },
                addEventListener(...args) {
                    return audioBufferSourceNode.addEventListener(args[0], args[1], args[2]);
                },
                dispatchEvent(...args) {
                    return audioBufferSourceNode.dispatchEvent(args[0]);
                },
                removeEventListener(...args) {
                    return audioBufferSourceNode.removeEventListener(args[0], args[1], args[2]);
                },
                start(when = 0) {
                    audioBufferSourceNode.start.call(audioBufferSourceNode, when);
                },
                stop(when = 0) {
                    audioBufferSourceNode.stop.call(audioBufferSourceNode, when);
                }
            };
            return interceptConnections(nativeConstantSourceNodeFaker, gainNode);
        };
    };

    const createNativeGainNodeFactory = (createNativeAudioNode) => {
        return (nativeContext, options) => {
            const nativeGainNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createGain());
            assignNativeAudioNodeOptions(nativeGainNode, options);
            if (options.gain !== nativeGainNode.gain.value) {
                nativeGainNode.gain.value = options.gain;
            }
            return nativeGainNode;
        };
    };

    const createNativeIIRFilterNodeFactory = (createNativeAudioNode, createNativeIIRFilterNodeFaker) => {
        return (nativeContext, options) => {
            // Bug #9: Safari does not support IIRFilterNodes.
            if (nativeContext.createIIRFilter === undefined) {
                return createNativeIIRFilterNodeFaker(nativeContext, options);
            }
            const nativeIIRFilterNode = createNativeAudioNode(nativeContext, (ntvCntxt) => {
                return ntvCntxt.createIIRFilter(options.feedforward, options.feedback);
            });
            assignNativeAudioNodeOptions(nativeIIRFilterNode, options);
            return nativeIIRFilterNode;
        };
    };

    function divide(a, b) {
        const denominator = (b[0] * b[0]) + (b[1] * b[1]);
        return [(((a[0] * b[0]) + (a[1] * b[1])) / denominator), (((a[1] * b[0]) - (a[0] * b[1])) / denominator)];
    }
    function multiply(a, b) {
        return [((a[0] * b[0]) - (a[1] * b[1])), ((a[0] * b[1]) + (a[1] * b[0]))];
    }
    function evaluatePolynomial(coefficient, z) {
        let result = [0, 0];
        for (let i = coefficient.length - 1; i >= 0; i -= 1) {
            result = multiply(result, z);
            result[0] += coefficient[i];
        }
        return result;
    }
    const createNativeIIRFilterNodeFakerFactory = (createInvalidAccessError, createInvalidStateError, createNativeScriptProcessorNode, createNotSupportedError) => {
        return (nativeContext, { channelCount, channelCountMode, channelInterpretation, feedback, feedforward }) => {
            const bufferSize = 256;
            const feedbackLength = feedback.length;
            const feedforwardLength = feedforward.length;
            const minLength = Math.min(feedbackLength, feedforwardLength);
            if (feedback.length === 0 || feedback.length > 20) {
                throw createNotSupportedError();
            }
            if (feedback[0] === 0) {
                throw createInvalidStateError();
            }
            if (feedforward.length === 0 || feedforward.length > 20) {
                throw createNotSupportedError();
            }
            if (feedforward[0] === 0) {
                throw createInvalidStateError();
            }
            if (feedback[0] !== 1) {
                for (let i = 0; i < feedforwardLength; i += 1) {
                    feedforward[i] /= feedback[0];
                }
                for (let i = 1; i < feedbackLength; i += 1) {
                    feedback[i] /= feedback[0];
                }
            }
            const scriptProcessorNode = createNativeScriptProcessorNode(nativeContext, bufferSize, channelCount, channelCount);
            scriptProcessorNode.channelCount = channelCount;
            scriptProcessorNode.channelCountMode = channelCountMode;
            scriptProcessorNode.channelInterpretation = channelInterpretation;
            const bufferLength = 32;
            const bufferIndexes = [];
            const xBuffers = [];
            const yBuffers = [];
            for (let i = 0; i < channelCount; i += 1) {
                bufferIndexes.push(0);
                const xBuffer = new Float32Array(bufferLength);
                const yBuffer = new Float32Array(bufferLength);
                // @todo Add a test which checks support for TypedArray.prototype.fill().
                xBuffer.fill(0);
                yBuffer.fill(0);
                xBuffers.push(xBuffer);
                yBuffers.push(yBuffer);
            }
            scriptProcessorNode.onaudioprocess = (event) => {
                const inputBuffer = event.inputBuffer;
                const outputBuffer = event.outputBuffer;
                const numberOfChannels = inputBuffer.numberOfChannels;
                for (let i = 0; i < numberOfChannels; i += 1) {
                    const input = inputBuffer.getChannelData(i);
                    const output = outputBuffer.getChannelData(i);
                    bufferIndexes[i] = filterBuffer(feedback, feedbackLength, feedforward, feedforwardLength, minLength, xBuffers[i], yBuffers[i], bufferIndexes[i], bufferLength, input, output);
                }
            };
            const nyquist = nativeContext.sampleRate / 2;
            const nativeIIRFilterNodeFaker = {
                get bufferSize() {
                    return bufferSize;
                },
                get channelCount() {
                    return scriptProcessorNode.channelCount;
                },
                set channelCount(value) {
                    scriptProcessorNode.channelCount = value;
                },
                get channelCountMode() {
                    return scriptProcessorNode.channelCountMode;
                },
                set channelCountMode(value) {
                    scriptProcessorNode.channelCountMode = value;
                },
                get channelInterpretation() {
                    return scriptProcessorNode.channelInterpretation;
                },
                set channelInterpretation(value) {
                    scriptProcessorNode.channelInterpretation = value;
                },
                get context() {
                    return scriptProcessorNode.context;
                },
                get inputs() {
                    return [scriptProcessorNode];
                },
                get numberOfInputs() {
                    return scriptProcessorNode.numberOfInputs;
                },
                get numberOfOutputs() {
                    return scriptProcessorNode.numberOfOutputs;
                },
                addEventListener(...args) {
                    // @todo Dissallow adding an audioprocess listener.
                    return scriptProcessorNode.addEventListener(args[0], args[1], args[2]);
                },
                dispatchEvent(...args) {
                    return scriptProcessorNode.dispatchEvent(args[0]);
                },
                getFrequencyResponse(frequencyHz, magResponse, phaseResponse) {
                    if ((frequencyHz.length !== magResponse.length) || (magResponse.length !== phaseResponse.length)) {
                        throw createInvalidAccessError();
                    }
                    const length = frequencyHz.length;
                    for (let i = 0; i < length; i += 1) {
                        const omega = -Math.PI * (frequencyHz[i] / nyquist);
                        const z = [Math.cos(omega), Math.sin(omega)];
                        const numerator = evaluatePolynomial(feedforward, z);
                        const denominator = evaluatePolynomial(feedback, z);
                        const response = divide(numerator, denominator);
                        magResponse[i] = Math.sqrt((response[0] * response[0]) + (response[1] * response[1]));
                        phaseResponse[i] = Math.atan2(response[1], response[0]);
                    }
                },
                removeEventListener(...args) {
                    return scriptProcessorNode.removeEventListener(args[0], args[1], args[2]);
                }
            };
            return interceptConnections(nativeIIRFilterNodeFaker, scriptProcessorNode);
        };
    };

    const createNativeOfflineAudioContextConstructor = (window) => {
        if (window === null) {
            return null;
        }
        if (window.hasOwnProperty('OfflineAudioContext')) {
            return window.OfflineAudioContext;
        }
        return (window.hasOwnProperty('webkitOfflineAudioContext')) ? window.webkitOfflineAudioContext : null;
    };

    const createNativeOscillatorNodeFactory = (createNativeAudioNode, testAudioScheduledSourceNodeStartMethodNegativeParametersSupport, testAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport, testAudioScheduledSourceNodeStopMethodNegativeParametersSupport, wrapAudioScheduledSourceNodeStopMethodConsecutiveCalls) => {
        return (nativeContext, options) => {
            const nativeOscillatorNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createOscillator());
            assignNativeAudioNodeOptions(nativeOscillatorNode, options);
            if (options.detune !== nativeOscillatorNode.detune.value) {
                nativeOscillatorNode.detune.value = options.detune;
            }
            if (options.frequency !== nativeOscillatorNode.frequency.value) {
                nativeOscillatorNode.frequency.value = options.frequency;
            }
            // @todo periodicWave
            if (options.type !== nativeOscillatorNode.type) {
                nativeOscillatorNode.type = options.type;
            }
            // Bug #44: Only Chrome & Opera throw a RangeError yet.
            if (!cacheTestResult(testAudioScheduledSourceNodeStartMethodNegativeParametersSupport, () => testAudioScheduledSourceNodeStartMethodNegativeParametersSupport(nativeContext))) {
                wrapAudioScheduledSourceNodeStartMethodNegativeParameters(nativeOscillatorNode);
            }
            // Bug #19: Safari does not ignore calls to stop() of an already stopped AudioBufferSourceNode.
            if (!cacheTestResult(testAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport, () => testAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport(nativeContext))) {
                wrapAudioScheduledSourceNodeStopMethodConsecutiveCalls(nativeOscillatorNode, nativeContext);
            }
            // Bug #44: No browser does throw a RangeError yet.
            if (!cacheTestResult(testAudioScheduledSourceNodeStopMethodNegativeParametersSupport, () => testAudioScheduledSourceNodeStopMethodNegativeParametersSupport(nativeContext))) {
                wrapAudioScheduledSourceNodeStopMethodNegativeParameters(nativeOscillatorNode);
            }
            return nativeOscillatorNode;
        };
    };

    const createNativeScriptProcessorNodeFactory = (createNativeAudioNode) => {
        return (nativeContext, bufferSize, numberOfInputChannels, numberOfOutputChannels) => {
            return createNativeAudioNode(nativeContext, (ntvCntxt) => {
                return ntvCntxt.createScriptProcessor(bufferSize, numberOfInputChannels, numberOfOutputChannels);
            });
        };
    };

    const createNativeStereoPannerNodeFactory = (createNativeAudioNode, createNativeStereoPannerNodeFaker, createNotSupportedError) => {
        return (nativeContext, options) => createNativeAudioNode(nativeContext, (ntvCntxt) => {
            const channelCountMode = options.channelCountMode;
            /*
             * Bug #105: The channelCountMode of 'clamped-max' should be supported. However it is not possible to write a polyfill for Safari
             * which supports it and therefore it can't be supported at all.
             */
            if (options.channelCountMode === 'clamped-max') {
                throw createNotSupportedError();
            }
            // Bug #105: Safari does not support the StereoPannerNode.
            if (nativeContext.createStereoPanner === undefined) {
                return createNativeStereoPannerNodeFaker(nativeContext, options);
            }
            const nativeStereoPannerNode = ntvCntxt.createStereoPanner();
            assignNativeAudioNodeOptions(nativeStereoPannerNode, options);
            if (options.pan !== nativeStereoPannerNode.pan.value) {
                nativeStereoPannerNode.pan.value = options.pan;
            }
            // Bug #107: Firefox does not kick off the processing of the StereoPannerNode if the value of pan is zero.
            if (options.pan === 0) {
                const gainNode = ntvCntxt.createGain();
                gainNode.connect(nativeStereoPannerNode.pan);
            }
            /*
             * Bug #105: The channelCountMode of 'clamped-max' should be supported. However it is not possible to write a polyfill for Safari
             * which supports it and therefore it can't be supported at all.
             */
            Object.defineProperty(nativeStereoPannerNode, 'channelCountMode', {
                get: () => channelCountMode,
                set: (value) => {
                    if (value !== channelCountMode) {
                        throw createNotSupportedError();
                    }
                }
            });
            return nativeStereoPannerNode;
        });
    };

    const createNativeStereoPannerNodeFakerFactory = (createNativeChannelMergerNode, createNativeChannelSplitterNode, createNativeGainNode, createNativeWaveShaperNode, createNotSupportedError) => {
        // The curve has a size of 14bit plus 1 value to have an exact representation for zero. This value has been determined experimentally.
        const CURVE_SIZE = 16385;
        const DC_CURVE = new Float32Array([1, 1]);
        const HALF_PI = Math.PI / 2;
        const SINGLE_CHANNEL_OPTIONS = {
            channelCount: 1,
            channelCountMode: 'explicit',
            channelInterpretation: 'discrete'
        };
        const SINGLE_CHANNEL_WAVE_SHAPER_OPTIONS = Object.assign({}, SINGLE_CHANNEL_OPTIONS, { oversample: 'none' });
        const buildInternalGraphForMono = (nativeContext, inputGainNode, panGainNode, channelMergerNode) => {
            const leftWaveShaperCurve = new Float32Array(CURVE_SIZE);
            const rightWaveShaperCurve = new Float32Array(CURVE_SIZE);
            for (let i = 0; i < CURVE_SIZE; i += 1) {
                const x = (i / (CURVE_SIZE - 1)) * HALF_PI;
                leftWaveShaperCurve[i] = Math.cos(x);
                rightWaveShaperCurve[i] = Math.sin(x);
            }
            const leftGainNode = createNativeGainNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_OPTIONS, { gain: 0 }));
            const leftWaveShaperNode = createNativeWaveShaperNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_WAVE_SHAPER_OPTIONS, { curve: leftWaveShaperCurve }));
            const panWaveShaperNode = createNativeWaveShaperNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_WAVE_SHAPER_OPTIONS, { curve: DC_CURVE }));
            const rightGainNode = createNativeGainNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_OPTIONS, { gain: 0 }));
            const rightWaveShaperNode = createNativeWaveShaperNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_WAVE_SHAPER_OPTIONS, { curve: rightWaveShaperCurve }));
            inputGainNode.connect(leftGainNode);
            inputGainNode.connect(panWaveShaperNode);
            inputGainNode.connect(rightGainNode);
            panWaveShaperNode.connect(panGainNode);
            panGainNode.connect(leftWaveShaperNode);
            panGainNode.connect(rightWaveShaperNode);
            leftWaveShaperNode.connect(leftGainNode.gain);
            rightWaveShaperNode.connect(rightGainNode.gain);
            leftGainNode.connect(channelMergerNode, 0, 0);
            rightGainNode.connect(channelMergerNode, 0, 1);
            return [leftGainNode, rightGainNode];
        };
        const buildInternalGraphForStereo = (nativeContext, inputGainNode, panGainNode, channelMergerNode) => {
            const leftInputForLeftOutputWaveShaperCurve = new Float32Array(CURVE_SIZE);
            const leftInputForRightOutputWaveShaperCurve = new Float32Array(CURVE_SIZE);
            const rightInputForLeftOutputWaveShaperCurve = new Float32Array(CURVE_SIZE);
            const rightInputForRightOutputWaveShaperCurve = new Float32Array(CURVE_SIZE);
            const centerIndex = Math.floor(CURVE_SIZE / 2);
            for (let i = 0; i < CURVE_SIZE; i += 1) {
                if (i > centerIndex) {
                    const x = ((i - centerIndex) / (CURVE_SIZE - 1 - centerIndex)) * HALF_PI;
                    leftInputForLeftOutputWaveShaperCurve[i] = Math.cos(x);
                    leftInputForRightOutputWaveShaperCurve[i] = Math.sin(x);
                    rightInputForLeftOutputWaveShaperCurve[i] = 0;
                    rightInputForRightOutputWaveShaperCurve[i] = 1;
                }
                else {
                    const x = (i / (CURVE_SIZE - 1 - centerIndex)) * HALF_PI;
                    leftInputForLeftOutputWaveShaperCurve[i] = 1;
                    leftInputForRightOutputWaveShaperCurve[i] = 0;
                    rightInputForLeftOutputWaveShaperCurve[i] = Math.cos(x);
                    rightInputForRightOutputWaveShaperCurve[i] = Math.sin(x);
                }
            }
            const channelSplitterNode = createNativeChannelSplitterNode(nativeContext, {
                channelCount: 2,
                channelCountMode: 'explicit',
                channelInterpretation: 'discrete',
                numberOfOutputs: 2
            });
            const leftInputForLeftOutputGainNode = createNativeGainNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_OPTIONS, { gain: 0 }));
            const leftInputForLeftOutputWaveShaperNode = createNativeWaveShaperNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_WAVE_SHAPER_OPTIONS, { curve: leftInputForLeftOutputWaveShaperCurve }));
            const leftInputForRightOutputGainNode = createNativeGainNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_OPTIONS, { gain: 0 }));
            const leftInputForRightOutputWaveShaperNode = createNativeWaveShaperNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_WAVE_SHAPER_OPTIONS, { curve: leftInputForRightOutputWaveShaperCurve }));
            const panWaveShaperNode = createNativeWaveShaperNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_WAVE_SHAPER_OPTIONS, { curve: DC_CURVE }));
            const rightInputForLeftOutputGainNode = createNativeGainNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_OPTIONS, { gain: 0 }));
            const rightInputForLeftOutputWaveShaperNode = createNativeWaveShaperNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_WAVE_SHAPER_OPTIONS, { curve: rightInputForLeftOutputWaveShaperCurve }));
            const rightInputForRightOutputGainNode = createNativeGainNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_OPTIONS, { gain: 0 }));
            const rightInputForRightOutputWaveShaperNode = createNativeWaveShaperNode(nativeContext, Object.assign({}, SINGLE_CHANNEL_WAVE_SHAPER_OPTIONS, { curve: rightInputForRightOutputWaveShaperCurve }));
            inputGainNode.connect(channelSplitterNode);
            inputGainNode.connect(panWaveShaperNode);
            channelSplitterNode.connect(leftInputForLeftOutputGainNode, 1);
            channelSplitterNode.connect(leftInputForRightOutputGainNode, 1);
            channelSplitterNode.connect(rightInputForLeftOutputGainNode, 1);
            channelSplitterNode.connect(rightInputForRightOutputGainNode, 1);
            panWaveShaperNode.connect(panGainNode);
            panGainNode.connect(leftInputForLeftOutputWaveShaperNode);
            panGainNode.connect(leftInputForRightOutputWaveShaperNode);
            panGainNode.connect(rightInputForLeftOutputWaveShaperNode);
            panGainNode.connect(rightInputForRightOutputWaveShaperNode);
            leftInputForLeftOutputWaveShaperNode.connect(leftInputForLeftOutputGainNode.gain);
            leftInputForRightOutputWaveShaperNode.connect(leftInputForRightOutputGainNode.gain);
            rightInputForLeftOutputWaveShaperNode.connect(rightInputForLeftOutputGainNode.gain);
            rightInputForRightOutputWaveShaperNode.connect(rightInputForRightOutputGainNode.gain);
            leftInputForLeftOutputGainNode.connect(channelMergerNode, 0, 0);
            rightInputForLeftOutputGainNode.connect(channelMergerNode, 0, 0);
            leftInputForRightOutputGainNode.connect(channelMergerNode, 0, 1);
            rightInputForRightOutputGainNode.connect(channelMergerNode, 0, 1);
            return [
                leftInputForLeftOutputGainNode,
                rightInputForLeftOutputGainNode,
                leftInputForRightOutputGainNode,
                rightInputForRightOutputGainNode
            ];
        };
        const buildInternalGraph = (nativeContext, channelCount, inputGainNode, panGainNode, channelMergerNode) => {
            if (channelCount === 1) {
                return buildInternalGraphForMono(nativeContext, inputGainNode, panGainNode, channelMergerNode);
            }
            else if (channelCount === 2) {
                return buildInternalGraphForStereo(nativeContext, inputGainNode, panGainNode, channelMergerNode);
            }
            throw createNotSupportedError();
        };
        return (nativeContext, _a) => {
            var { channelCount, channelCountMode, pan } = _a, audioNodeOptions = __rest(_a, ["channelCount", "channelCountMode", "pan"]);
            if (channelCountMode === 'max') {
                throw createNotSupportedError();
            }
            const channelMergerNode = createNativeChannelMergerNode(nativeContext, Object.assign({}, audioNodeOptions, { channelCount: 1, channelCountMode, numberOfInputs: 2 }));
            const inputGainNode = createNativeGainNode(nativeContext, Object.assign({}, audioNodeOptions, { channelCount, channelCountMode, gain: 1 }));
            const panGainNode = createNativeGainNode(nativeContext, {
                channelCount: 1,
                channelCountMode: 'explicit',
                channelInterpretation: 'discrete',
                gain: pan
            });
            let outputNodes = buildInternalGraph(nativeContext, channelCount, inputGainNode, panGainNode, channelMergerNode);
            const panAudioParam = Object.defineProperties(panGainNode.gain, { defaultValue: { get: () => 0 } });
            const nativeStereoPannerNodeFakerFactory = {
                get bufferSize() {
                    return undefined;
                },
                get channelCount() {
                    return inputGainNode.channelCount;
                },
                set channelCount(value) {
                    if (inputGainNode.channelCount !== value) {
                        inputGainNode.disconnect();
                        outputNodes.forEach((outputNode) => outputNode.disconnect());
                        outputNodes = buildInternalGraph(nativeContext, value, inputGainNode, panGainNode, channelMergerNode);
                    }
                    inputGainNode.channelCount = value;
                },
                get channelCountMode() {
                    return inputGainNode.channelCountMode;
                },
                set channelCountMode(value) {
                    if (value === 'clamped-max' || value === 'max') {
                        throw createNotSupportedError();
                    }
                    inputGainNode.channelCountMode = value;
                },
                get channelInterpretation() {
                    return inputGainNode.channelInterpretation;
                },
                set channelInterpretation(value) {
                    inputGainNode.channelInterpretation = value;
                },
                get context() {
                    return inputGainNode.context;
                },
                get inputs() {
                    return [inputGainNode];
                },
                get numberOfInputs() {
                    return inputGainNode.numberOfInputs;
                },
                get numberOfOutputs() {
                    return inputGainNode.numberOfOutputs;
                },
                get pan() {
                    return panAudioParam;
                },
                addEventListener(...args) {
                    return inputGainNode.addEventListener(args[0], args[1], args[2]);
                },
                dispatchEvent(...args) {
                    return inputGainNode.dispatchEvent(args[0]);
                },
                removeEventListener(...args) {
                    return inputGainNode.removeEventListener(args[0], args[1], args[2]);
                }
            };
            return interceptConnections(nativeStereoPannerNodeFakerFactory, channelMergerNode);
        };
    };

    const createNativeWaveShaperNodeFactory = (createInvalidStateError, createNativeAudioNode) => {
        return (nativeContext, options) => createNativeAudioNode(nativeContext, (ntvCntxt) => {
            const nativeWaveShaperNode = ntvCntxt.createWaveShaper();
            assignNativeAudioNodeOptions(nativeWaveShaperNode, options);
            if (options.curve !== nativeWaveShaperNode.curve) {
                const curve = options.curve;
                // Bug #102: Safari does not throw an InvalidStateError when the curve has less than two samples.
                // Bug #104: Chrome will throw an InvalidAccessError when the curve has less than two samples.
                if (curve !== null && curve.length < 2) {
                    throw createInvalidStateError();
                }
                nativeWaveShaperNode.curve = curve;
            }
            if (options.oversample !== nativeWaveShaperNode.oversample) {
                nativeWaveShaperNode.oversample = options.oversample;
            }
            return nativeWaveShaperNode;
        });
    };

    const createNoneAudioDestinationNodeConstructor = (audioNodeConstructor) => {
        return class NoneAudioDestinationNode extends audioNodeConstructor {
            constructor(context, nativeAudioNode, audioNodeRenderer) {
                super(context, nativeAudioNode, audioNodeRenderer);
            }
        };
    };

    const createNotSupportedError = () => {
        try {
            return new DOMException('', 'NotSupportedError');
        }
        catch (err) {
            err.code = 9;
            err.name = 'NotSupportedError';
            return err;
        }
    };

    const DEFAULT_OPTIONS$d = {
        numberOfChannels: 1
    };
    const createOfflineAudioContextConstructor = (baseAudioContextConstructor, createInvalidStateError, nativeOfflineAudioContextConstructor, startRendering) => {
        return class OfflineAudioContext extends baseAudioContextConstructor {
            constructor(a, b, c) {
                if (nativeOfflineAudioContextConstructor === null) {
                    throw new Error(); // @todo
                }
                let options;
                if (typeof a === 'number' && b !== undefined && c !== undefined) {
                    options = { length: b, numberOfChannels: a, sampleRate: c };
                }
                else if (typeof a === 'object') {
                    options = a;
                }
                else {
                    throw new Error('The given parameters are not valid.');
                }
                const { length, numberOfChannels, sampleRate } = Object.assign({}, DEFAULT_OPTIONS$d, options);
                const nativeOfflineAudioContext = new nativeOfflineAudioContextConstructor(numberOfChannels, length, sampleRate);
                // #21 Safari does not support promises and therefore would fire the statechange event before the promise can be resolved.
                if (!cacheTestResult(testPromiseSupport, () => testPromiseSupport(nativeOfflineAudioContext))) {
                    nativeOfflineAudioContext.addEventListener('statechange', (() => {
                        let i = 0;
                        const delayStateChangeEvent = (event) => {
                            if (this._state === 'running') {
                                if (i > 0) {
                                    nativeOfflineAudioContext.removeEventListener('statechange', delayStateChangeEvent);
                                    event.stopImmediatePropagation();
                                    this._waitForThePromiseToSettle(event);
                                }
                                else {
                                    i += 1;
                                }
                            }
                        };
                        return delayStateChangeEvent;
                    })());
                }
                super(nativeOfflineAudioContext, numberOfChannels);
                this._length = length;
                this._nativeOfflineAudioContext = nativeOfflineAudioContext;
                this._state = null;
            }
            get length() {
                // Bug #17: Safari does not yet expose the length.
                if (this._nativeOfflineAudioContext.length === undefined) {
                    return this._length;
                }
                return this._nativeOfflineAudioContext.length;
            }
            get state() {
                return (this._state === null) ? this._nativeOfflineAudioContext.state : this._state;
            }
            startRendering() {
                /*
                 * Bug #9 & #59: It is theoretically possible that startRendering() will first render a partialOfflineAudioContext. Therefore
                 * the state of the nativeOfflineAudioContext might no transition to running immediately.
                 */
                if (this._state === 'running') {
                    return Promise.reject(createInvalidStateError());
                }
                this._state = 'running';
                return startRendering(this.destination, this._nativeOfflineAudioContext)
                    .then((audioBuffer) => {
                    this._state = null;
                    /*
                     * Bug #50: Deleting the AudioGraph is currently not possible anymore.
                     * deleteAudioGraph(this, this._nativeOfflineAudioContext);
                     */
                    return audioBuffer;
                })
                    // @todo This could be written more elegantly when Promise.finally() becomes avalaible.
                    .catch((err) => {
                    this._state = null;
                    /*
                     * Bug #50: Deleting the AudioGraph is currently not possible anymore.
                     * deleteAudioGraph(this, this._nativeOfflineAudioContext);
                     */
                    throw err; // tslint:disable-line:rxjs-throw-error
                });
            }
            _waitForThePromiseToSettle(event) {
                if (this._state === null) {
                    this._nativeOfflineAudioContext.dispatchEvent(event);
                }
                else {
                    setTimeout(() => this._waitForThePromiseToSettle(event));
                }
            }
        };
    };

    // The DEFAULT_OPTIONS are only of type Partial<IOscillatorOptions> because there is no default value for periodicWave.
    const DEFAULT_OPTIONS$e = {
        channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers',
        detune: 0,
        frequency: 440,
        type: 'sine'
    };
    const createOscillatorNodeConstructor = (createAudioParam, createInvalidStateError, createNativeOscillatorNode, createOscillatorNodeRenderer, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class OscillatorNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS$e) {
                const absoluteValue = 1200 * Math.log2(context.sampleRate);
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS$e, options);
                const nativeOscillatorNode = createNativeOscillatorNode(nativeContext, mergedOptions);
                const isOffline = isNativeOfflineAudioContext(nativeContext);
                const oscillatorNodeRenderer = (isOffline) ? createOscillatorNodeRenderer() : null;
                const nyquist = context.sampleRate / 2;
                super(context, nativeOscillatorNode, oscillatorNodeRenderer);
                // Bug #81: Edge & Safari do not export the correct values for maxValue and minValue.
                this._detune = createAudioParam(context, isOffline, nativeOscillatorNode.detune, absoluteValue, -absoluteValue);
                // Bug #76: Edge & Safari do not export the correct values for maxValue and minValue.
                this._frequency = createAudioParam(context, isOffline, nativeOscillatorNode.frequency, nyquist, -nyquist);
                this._nativeOscillatorNode = nativeOscillatorNode;
                this._oscillatorNodeRenderer = oscillatorNodeRenderer;
            }
            get detune() {
                return this._detune;
            }
            get frequency() {
                return this._frequency;
            }
            get onended() {
                return this._nativeOscillatorNode.onended;
            }
            set onended(value) {
                this._nativeOscillatorNode.onended = value;
            }
            get type() {
                return this._nativeOscillatorNode.type;
            }
            set type(value) {
                this._nativeOscillatorNode.type = value;
                // Bug #57: Edge will not throw an error when assigning the type to 'custom'. But it still will change the value.
                if (value === 'custom') {
                    throw createInvalidStateError();
                }
            }
            setPeriodicWave(periodicWave) {
                this._nativeOscillatorNode.setPeriodicWave(periodicWave);
            }
            start(when = 0) {
                this._nativeOscillatorNode.start(when);
                if (this._oscillatorNodeRenderer !== null) {
                    this._oscillatorNodeRenderer.start = when;
                }
            }
            stop(when = 0) {
                this._nativeOscillatorNode.stop(when);
                if (this._oscillatorNodeRenderer !== null) {
                    this._oscillatorNodeRenderer.stop = when;
                }
            }
        };
    };

    const createOscillatorNodeRendererFactory = (createNativeOscillatorNode) => {
        return () => {
            let nativeOscillatorNode = null;
            let start = null;
            let stop = null;
            return {
                set start(value) {
                    start = value;
                },
                set stop(value) {
                    stop = value;
                },
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeOscillatorNode !== null) {
                        return nativeOscillatorNode;
                    }
                    nativeOscillatorNode = getNativeAudioNode(proxy);
                    /*
                     * If the initially used nativeOscillatorNode was not constructed on the same OfflineAudioContext it needs to be created
                     * again.
                     */
                    if (!isOwnedByContext(nativeOscillatorNode, nativeOfflineAudioContext)) {
                        const options = {
                            channelCount: nativeOscillatorNode.channelCount,
                            channelCountMode: nativeOscillatorNode.channelCountMode,
                            channelInterpretation: nativeOscillatorNode.channelInterpretation,
                            detune: nativeOscillatorNode.detune.value,
                            frequency: nativeOscillatorNode.frequency.value,
                            // @todo periodicWave is not exposed by the native node.
                            type: nativeOscillatorNode.type
                        };
                        nativeOscillatorNode = createNativeOscillatorNode(nativeOfflineAudioContext, options);
                        if (start !== null) {
                            nativeOscillatorNode.start(start);
                        }
                        if (stop !== null) {
                            nativeOscillatorNode.stop(stop);
                        }
                        await renderAutomation(proxy.context, nativeOfflineAudioContext, proxy.detune, nativeOscillatorNode.detune);
                        await renderAutomation(proxy.context, nativeOfflineAudioContext, proxy.frequency, nativeOscillatorNode.frequency);
                    }
                    else {
                        await connectAudioParam(proxy.context, nativeOfflineAudioContext, proxy.detune);
                        await connectAudioParam(proxy.context, nativeOfflineAudioContext, proxy.frequency);
                    }
                    await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeOscillatorNode);
                    return nativeOscillatorNode;
                }
            };
        };
    };

    const createRenderNativeOfflineAudioContext = (createNativeGainNode) => {
        return (nativeOfflineAudioContext) => {
            // Bug #21: Safari does not support promises yet.
            if (cacheTestResult(testPromiseSupport, () => testPromiseSupport(nativeOfflineAudioContext))) {
                return nativeOfflineAudioContext.startRendering();
            }
            return new Promise((resolve) => {
                // Bug #48: Safari does not render an OfflineAudioContext without any connected node.
                const gainNode = createNativeGainNode(nativeOfflineAudioContext, {
                    channelCount: 1,
                    channelCountMode: 'explicit',
                    channelInterpretation: 'discrete',
                    gain: 0
                });
                nativeOfflineAudioContext.oncomplete = (event) => {
                    gainNode.disconnect();
                    resolve(event.renderedBuffer);
                };
                gainNode.connect(nativeOfflineAudioContext.destination);
                nativeOfflineAudioContext.startRendering();
            });
        };
    };

    const createStartRendering = (renderNativeOfflineAudioContext, testAudioBufferCopyChannelMethodsSubarraySupport) => {
        return (destination, nativeOfflineAudioContext) => getAudioNodeRenderer(destination)
            .render(destination, nativeOfflineAudioContext)
            .then(() => renderNativeOfflineAudioContext(nativeOfflineAudioContext))
            .then((audioBuffer) => {
            // Bug #5: Safari does not support copyFromChannel() and copyToChannel().
            // Bug #100: Safari does throw a wrong error when calling getChannelData() with an out-of-bounds value.
            if (typeof audioBuffer.copyFromChannel !== 'function') {
                wrapAudioBufferCopyChannelMethods(audioBuffer);
                wrapAudioBufferGetChannelDataMethod(audioBuffer);
                // Bug #42: Firefox does not yet fully support copyFromChannel() and copyToChannel().
            }
            else if (!cacheTestResult(testAudioBufferCopyChannelMethodsSubarraySupport, () => testAudioBufferCopyChannelMethodsSubarraySupport(audioBuffer))) {
                wrapAudioBufferCopyChannelMethodsSubarray(audioBuffer);
            }
            return audioBuffer;
        });
    };

    const DEFAULT_OPTIONS$f = {
        channelCount: 2,
        /*
         * Bug #105: The channelCountMode should be 'clamped-max' according to the spec but is set to 'explicit' to achieve consistent
         * behavior.
         */
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        pan: 0
    };
    const createStereoPannerNodeConstructor = (createAudioParam, createNativeStereoPannerNode, createStereoPannerNodeRenderer, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class StereoPannerNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS$f) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS$f, options);
                const nativeStereoPannerNode = createNativeStereoPannerNode(nativeContext, mergedOptions);
                const isOffline = isNativeOfflineAudioContext(nativeContext);
                const stereoPannerNodeRenderer = (isOffline) ? createStereoPannerNodeRenderer() : null;
                super(context, nativeStereoPannerNode, stereoPannerNodeRenderer);
                // Bug #106: Edge does not export a maxValue and minValue property.
                this._pan = createAudioParam(context, isOffline, nativeStereoPannerNode.pan, 1, -1);
            }
            get pan() {
                return this._pan;
            }
        };
    };

    const createStereoPannerNodeRendererFactory = (createNativeStereoPannerNode) => {
        return () => {
            let nativeStereoPannerNode = null;
            return {
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeStereoPannerNode !== null) {
                        return nativeStereoPannerNode;
                    }
                    nativeStereoPannerNode = getNativeAudioNode(proxy);
                    /*
                     * If the initially used nativeStereoPannerNode was not constructed on the same OfflineAudioContext it needs to be created
                     * again.
                     */
                    if (!isOwnedByContext(nativeStereoPannerNode, nativeOfflineAudioContext)) {
                        const options = {
                            channelCount: nativeStereoPannerNode.channelCount,
                            channelCountMode: nativeStereoPannerNode.channelCountMode,
                            channelInterpretation: nativeStereoPannerNode.channelInterpretation,
                            pan: nativeStereoPannerNode.pan.value
                        };
                        nativeStereoPannerNode = createNativeStereoPannerNode(nativeOfflineAudioContext, options);
                        await renderAutomation(proxy.context, nativeOfflineAudioContext, proxy.pan, nativeStereoPannerNode.pan);
                    }
                    else {
                        await connectAudioParam(proxy.context, nativeOfflineAudioContext, proxy.pan);
                    }
                    if (nativeStereoPannerNode.inputs !== undefined) {
                        await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeStereoPannerNode.inputs[0]);
                    }
                    else {
                        await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeStereoPannerNode);
                    }
                    return nativeStereoPannerNode;
                }
            };
        };
    };

    // Bug #33: Edge & Safari expose an AudioBuffer but it can't be used as a constructor.
    const createTestAudioBufferConstructorSupport = (nativeAudioBufferConstructor) => {
        return () => {
            if (nativeAudioBufferConstructor === null) {
                return false;
            }
            try {
                new nativeAudioBufferConstructor({ length: 1, sampleRate: 44100 }); // tslint:disable-line:no-unused-expression
            }
            catch (_a) {
                return false;
            }
            return true;
        };
    };

    const createTestAudioBufferSourceNodeStartMethodConsecutiveCallsSupport = (createNativeAudioNode) => {
        return (nativeContext) => {
            const nativeAudioBufferSourceNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createBufferSource());
            nativeAudioBufferSourceNode.start();
            try {
                nativeAudioBufferSourceNode.start();
            }
            catch (_a) {
                return true;
            }
            return false;
        };
    };

    // Bug #92: Edge does not respect the duration parameter yet.
    const createTestAudioBufferSourceNodeStartMethodDurationParameterSupport = (nativeOfflineAudioContextConstructor) => {
        return () => {
            if (nativeOfflineAudioContextConstructor === null) {
                return Promise.resolve(false);
            }
            const offlineAudioContext = new nativeOfflineAudioContextConstructor(1, 1, 44100);
            const audioBuffer = offlineAudioContext.createBuffer(1, 1, offlineAudioContext.sampleRate);
            const audioBufferSourceNode = offlineAudioContext.createBufferSource();
            audioBuffer.getChannelData(0)[0] = 1;
            audioBufferSourceNode.buffer = audioBuffer;
            audioBufferSourceNode.start(0, 0, 0);
            audioBufferSourceNode.connect(offlineAudioContext.destination);
            // Bug #21: Safari does not support promises yet.
            return new Promise((resolve) => {
                offlineAudioContext.oncomplete = ({ renderedBuffer }) => {
                    // Bug #5: Safari does not support copyFromChannel().
                    resolve(renderedBuffer.getChannelData(0)[0] === 0);
                };
                offlineAudioContext.startRendering();
            });
        };
    };

    /**
     * Edge up to version 14, Firefox up to version 52, Safari up to version 9 and maybe other browsers
     * did not refuse to decode invalid parameters with a TypeError.
     */

    const createTestAudioScheduledSourceNodeStartMethodNegativeParametersSupport = (createNativeAudioNode) => {
        return (nativeContext) => {
            const nativeAudioBufferSourceNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createBufferSource());
            try {
                nativeAudioBufferSourceNode.start(-1);
            }
            catch (err) {
                return (err instanceof RangeError);
            }
            return false;
        };
    };

    const createTestAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport = (createNativeAudioNode) => {
        return (nativeContext) => {
            const nativeAudioBuffer = nativeContext.createBuffer(1, 1, 44100);
            const nativeAudioBufferSourceNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createBufferSource());
            nativeAudioBufferSourceNode.buffer = nativeAudioBuffer;
            nativeAudioBufferSourceNode.start();
            nativeAudioBufferSourceNode.stop();
            try {
                nativeAudioBufferSourceNode.stop();
                return true;
            }
            catch (_a) {
                return false;
            }
        };
    };

    const createTestAudioScheduledSourceNodeStopMethodNegativeParametersSupport = (createNativeAudioNode) => {
        return (nativeContext) => {
            const nativeAudioBufferSourceNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createBufferSource());
            try {
                nativeAudioBufferSourceNode.stop(-1);
            }
            catch (err) {
                return (err instanceof RangeError);
            }
            return false;
        };
    };

    /**
     * Firefox up to version 44 had a bug which resulted in a misbehaving ChannelMergerNode. If one of
     * its channels would be unconnected the remaining channels were somehow upmixed to spread the
     * signal across all available channels.
     */

    /**
     * Firefox up to version 61 had a bug which caused the ChannelSplitterNode to expose a wrong channelCount property.
     */

    const DEFAULT_OPTIONS$g = {
        curve: null,
        oversample: 'none'
    };
    const createWaveShaperNodeConstructor = (createInvalidStateError, createNativeWaveShaperNode, createWaveShaperNodeRenderer, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor) => {
        return class WaveShaperNode extends noneAudioDestinationNodeConstructor {
            constructor(context, options = DEFAULT_OPTIONS$g) {
                const nativeContext = getNativeContext(context);
                const mergedOptions = Object.assign({}, DEFAULT_OPTIONS$g, options);
                const nativeWaveShaperNode = createNativeWaveShaperNode(nativeContext, mergedOptions);
                const isOffline = isNativeOfflineAudioContext(nativeContext);
                const waveShaperNodeRenderer = (isOffline) ? createWaveShaperNodeRenderer() : null;
                super(context, nativeWaveShaperNode, waveShaperNodeRenderer);
                this._isCurveNullified = false;
                this._nativeWaveShaperNode = nativeWaveShaperNode;
            }
            get curve() {
                if (this._isCurveNullified) {
                    return null;
                }
                return this._nativeWaveShaperNode.curve;
            }
            set curve(value) {
                // Bug #103: Safari does not allow to set the curve to null.
                if (value === null) {
                    this._isCurveNullified = true;
                    this._nativeWaveShaperNode.curve = new Float32Array([0, 0]);
                    // Bug #102: Safari does not throw an InvalidStateError when the curve has less than two samples.
                    // Bug #104: Chrome will throw an InvalidAccessError when the curve has less than two samples.
                }
                else if (value.length < 2) {
                    throw createInvalidStateError();
                }
                else {
                    this._isCurveNullified = false;
                    this._nativeWaveShaperNode.curve = value;
                }
            }
            get oversample() {
                return this._nativeWaveShaperNode.oversample;
            }
            set oversample(value) {
                this._nativeWaveShaperNode.oversample = value;
            }
        };
    };

    const createWaveShaperNodeRendererFactory = (createNativeWaveShaperNode) => {
        return () => {
            let nativeWaveShaperNode = null;
            return {
                render: async (proxy, nativeOfflineAudioContext) => {
                    if (nativeWaveShaperNode !== null) {
                        return nativeWaveShaperNode;
                    }
                    nativeWaveShaperNode = getNativeAudioNode(proxy);
                    /*
                     * If the initially used nativeWaveShaperNode was not constructed on the same OfflineAudioContext it needs to be created
                     * again.
                     */
                    if (!isOwnedByContext(nativeWaveShaperNode, nativeOfflineAudioContext)) {
                        const options = {
                            channelCount: nativeWaveShaperNode.channelCount,
                            channelCountMode: nativeWaveShaperNode.channelCountMode,
                            channelInterpretation: nativeWaveShaperNode.channelInterpretation,
                            curve: nativeWaveShaperNode.curve,
                            oversample: nativeWaveShaperNode.oversample
                        };
                        nativeWaveShaperNode = createNativeWaveShaperNode(nativeOfflineAudioContext, options);
                    }
                    await renderInputsOfAudioNode(proxy, nativeOfflineAudioContext, nativeWaveShaperNode);
                    return nativeWaveShaperNode;
                }
            };
        };
    };

    const createWindow = () => (typeof window === 'undefined') ? null : window;

    const createWrapAudioScheduledSourceNodeStopMethodConsecutiveCalls = (createNativeAudioNode) => {
        return (nativeAudioScheduledSourceNode, nativeContext) => {
            const nativeGainNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createGain());
            nativeAudioScheduledSourceNode.connect(nativeGainNode);
            const disconnectGainNode = ((disconnect) => {
                return () => {
                    disconnect.call(nativeAudioScheduledSourceNode, nativeGainNode);
                    nativeAudioScheduledSourceNode.removeEventListener('ended', disconnectGainNode);
                };
            })(nativeAudioScheduledSourceNode.disconnect);
            nativeAudioScheduledSourceNode.addEventListener('ended', disconnectGainNode);
            interceptConnections(nativeAudioScheduledSourceNode, nativeGainNode);
            nativeAudioScheduledSourceNode.stop = ((stop) => {
                let isStopped = false;
                return (when = 0) => {
                    if (isStopped) {
                        try {
                            stop.call(nativeAudioScheduledSourceNode, when);
                        }
                        catch (_a) {
                            nativeGainNode.gain.setValueAtTime(0, when);
                        }
                    }
                    else {
                        stop.call(nativeAudioScheduledSourceNode, when);
                        isStopped = true;
                    }
                };
            })(nativeAudioScheduledSourceNode.stop);
        };
    };

    const createWrapChannelMergerNode = (createInvalidStateError, createNativeAudioNode) => {
        return (nativeContext, channelMergerNode) => {
            const audioBufferSourceNode = createNativeAudioNode(nativeContext, (ntvCntxt) => ntvCntxt.createBufferSource());
            channelMergerNode.channelCount = 1;
            channelMergerNode.channelCountMode = 'explicit';
            // Bug #20: Safari requires a connection of any kind to treat the input signal correctly.
            const length = channelMergerNode.numberOfInputs;
            for (let i = 0; i < length; i += 1) {
                audioBufferSourceNode.connect(channelMergerNode, 0, i);
            }
            Object.defineProperty(channelMergerNode, 'channelCount', {
                get: () => 1,
                set: () => {
                    throw createInvalidStateError();
                }
            });
            Object.defineProperty(channelMergerNode, 'channelCountMode', {
                get: () => 'explicit',
                set: () => {
                    throw createInvalidStateError();
                }
            });
        };
    };

    const window$1 = createWindow();
    const nativeOfflineAudioContextConstructor = createNativeOfflineAudioContextConstructor(window$1);
    const isNativeOfflineAudioContext = createIsNativeOfflineAudioContext(nativeOfflineAudioContextConstructor);
    const nativeAudioContextConstructor = createNativeAudioContextConstructor(window$1);
    const getBackupNativeContext = createGetBackupNativeContext(isNativeOfflineAudioContext, nativeAudioContextConstructor, nativeOfflineAudioContextConstructor);
    const createNativeAudioNode = createNativeAudioNodeFactory(getBackupNativeContext);
    const createNativeAnalyserNode = createNativeAnalyserNodeFactory(createNativeAudioNode);
    const createAnalyserNodeRenderer = createAnalyserNodeRendererFactory(createNativeAnalyserNode);
    const audioNodeConstructor = createAudioNodeConstructor(createInvalidAccessError, isNativeOfflineAudioContext);
    const noneAudioDestinationNodeConstructor = createNoneAudioDestinationNodeConstructor(audioNodeConstructor);
    const analyserNodeConstructor = createAnalyserNodeConstructor(createAnalyserNodeRenderer, createNativeAnalyserNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const nativeAudioBufferConstructor = createNativeAudioBufferConstructor(window$1);
    const audioBufferConstructor = createAudioBufferConstructor(createNotSupportedError, nativeAudioBufferConstructor, nativeOfflineAudioContextConstructor, createTestAudioBufferConstructorSupport(nativeAudioBufferConstructor));
    const testAudioScheduledSourceNodeStartMethodNegativeParametersSupport = createTestAudioScheduledSourceNodeStartMethodNegativeParametersSupport(createNativeAudioNode);
    const testAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport = createTestAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport(createNativeAudioNode);
    const testAudioScheduledSourceNodeStopMethodNegativeParametersSupport = createTestAudioScheduledSourceNodeStopMethodNegativeParametersSupport(createNativeAudioNode);
    const wrapAudioScheduledSourceNodeStopMethodConsecutiveCalls = createWrapAudioScheduledSourceNodeStopMethodConsecutiveCalls(createNativeAudioNode);
    const createNativeAudioBufferSourceNode = createNativeAudioBufferSourceNodeFactory(createNativeAudioNode, createTestAudioBufferSourceNodeStartMethodConsecutiveCallsSupport(createNativeAudioNode), createTestAudioBufferSourceNodeStartMethodDurationParameterSupport(nativeOfflineAudioContextConstructor), testAudioScheduledSourceNodeStartMethodNegativeParametersSupport, testAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport, testAudioScheduledSourceNodeStopMethodNegativeParametersSupport, wrapAudioScheduledSourceNodeStopMethodConsecutiveCalls);
    const createAudioBufferSourceNodeRenderer = createAudioBufferSourceNodeRendererFactory(createNativeAudioBufferSourceNode);
    const createAudioParam = createAudioParamFactory(createAudioParamRenderer);
    const audioBufferSourceNodeConstructor = createAudioBufferSourceNodeConstructor(createAudioBufferSourceNodeRenderer, createAudioParam, createInvalidStateError, createNativeAudioBufferSourceNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const audioDestinationNodeConstructor = createAudioDestinationNodeConstructor(audioNodeConstructor, createAudioDestinationNodeRenderer, createIndexSizeError, createInvalidStateError, createNativeAudioDestinationNode, isNativeOfflineAudioContext);
    const createNativeBiquadFilterNode = createNativeBiquadFilterNodeFactory(createNativeAudioNode);
    const createBiquadFilterNodeRenderer = createBiquadFilterNodeRendererFactory(createNativeBiquadFilterNode);
    const biquadFilterNodeConstructor = createBiquadFilterNodeConstructor(createAudioParam, createBiquadFilterNodeRenderer, createInvalidAccessError, createNativeBiquadFilterNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const wrapChannelMergerNode = createWrapChannelMergerNode(createInvalidStateError, createNativeAudioNode);
    const createNativeChannelMergerNode = createNativeChannelMergerNodeFactory(createNativeAudioNode, wrapChannelMergerNode);
    const createChannelMergerNodeRenderer = createChannelMergerNodeRendererFactory(createNativeChannelMergerNode);
    const channelMergerNodeConstructor = createChannelMergerNodeConstructor(createChannelMergerNodeRenderer, createNativeChannelMergerNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const createNativeChannelSplitterNode = createNativeChannelSplitterNodeFactory(createNativeAudioNode);
    const createChannelSplitterNodeRenderer = createChannelSplitterNodeRendererFactory(createNativeChannelSplitterNode);
    const channelSplitterNodeConstructor = createChannelSplitterNodeConstructor(createChannelSplitterNodeRenderer, createNativeChannelSplitterNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const createNativeGainNode = createNativeGainNodeFactory(createNativeAudioNode);
    const createNativeConstantSourceNodeFaker = createNativeConstantSourceNodeFakerFactory(createNativeAudioBufferSourceNode, createNativeGainNode);
    const createNativeConstantSourceNode = createNativeConstantSourceNodeFactory(createNativeAudioNode, createNativeConstantSourceNodeFaker, testAudioScheduledSourceNodeStartMethodNegativeParametersSupport, testAudioScheduledSourceNodeStopMethodNegativeParametersSupport);
    const createConstantSourceNodeRenderer = createConstantSourceNodeRendererFactory(createNativeConstantSourceNode);
    const constantSourceNodeConstructor = createConstantSourceNodeConstructor(createAudioParam, createConstantSourceNodeRenderer, createNativeConstantSourceNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const createGainNodeRenderer = createGainNodeRendererFactory(createNativeGainNode);
    const gainNodeConstructor = createGainNodeConstructor(createAudioParam, createGainNodeRenderer, createNativeGainNode, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const createNativeScriptProcessorNode = createNativeScriptProcessorNodeFactory(createNativeAudioNode);
    const createNativeIIRFilterNodeFaker = createNativeIIRFilterNodeFakerFactory(createInvalidAccessError, createInvalidStateError, createNativeScriptProcessorNode, createNotSupportedError);
    const renderNativeOfflineAudioContext = createRenderNativeOfflineAudioContext(createNativeGainNode);
    const createIIRFilterNodeRenderer = createIIRFilterNodeRendererFactory(createNativeAudioBufferSourceNode, createNativeAudioNode, nativeOfflineAudioContextConstructor, renderNativeOfflineAudioContext);
    const createNativeIIRFilterNode = createNativeIIRFilterNodeFactory(createNativeAudioNode, createNativeIIRFilterNodeFaker);
    const iIRFilterNodeConstructor = createIIRFilterNodeConstructor(createNativeIIRFilterNode, createIIRFilterNodeRenderer, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const minimalBaseAudioContextConstructor = createMinimalBaseAudioContextConstructor(audioDestinationNodeConstructor);
    const createNativeOscillatorNode = createNativeOscillatorNodeFactory(createNativeAudioNode, testAudioScheduledSourceNodeStartMethodNegativeParametersSupport, testAudioScheduledSourceNodeStopMethodConsecutiveCallsSupport, testAudioScheduledSourceNodeStopMethodNegativeParametersSupport, wrapAudioScheduledSourceNodeStopMethodConsecutiveCalls);
    const createOscillatorNodeRenderer = createOscillatorNodeRendererFactory(createNativeOscillatorNode);
    const oscillatorNodeConstructor = createOscillatorNodeConstructor(createAudioParam, createInvalidStateError, createNativeOscillatorNode, createOscillatorNodeRenderer, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const createNativeWaveShaperNode = createNativeWaveShaperNodeFactory(createInvalidStateError, createNativeAudioNode);
    const nativeStereoPannerNodeFakerFactory = createNativeStereoPannerNodeFakerFactory(createNativeChannelMergerNode, createNativeChannelSplitterNode, createNativeGainNode, createNativeWaveShaperNode, createNotSupportedError);
    const createNativeStereoPannerNode = createNativeStereoPannerNodeFactory(createNativeAudioNode, nativeStereoPannerNodeFakerFactory, createNotSupportedError);
    const createStereoPannerNodeRenderer = createStereoPannerNodeRendererFactory(createNativeStereoPannerNode);
    const stereoPannerNodeConstructor = createStereoPannerNodeConstructor(createAudioParam, createNativeStereoPannerNode, createStereoPannerNodeRenderer, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const createWaveShaperNodeRenderer = createWaveShaperNodeRendererFactory(createNativeWaveShaperNode);
    const waveShaperNodeConstructor = createWaveShaperNodeConstructor(createInvalidStateError, createNativeWaveShaperNode, createWaveShaperNodeRenderer, isNativeOfflineAudioContext, noneAudioDestinationNodeConstructor);
    const isSecureContext = createIsSecureContext(window$1);
    // The addAudioWorkletModule() function is only available in a SecureContext.
    const addAudioWorkletModule = (isSecureContext) ?
        createAddAudioWorkletModule(createAbortError, createNotSupportedError, createFetchSource(createAbortError), getBackupNativeContext) :
        undefined;
    const decodeAudioData = createDecodeAudioData(createDataCloneError, createEncodingError, nativeOfflineAudioContextConstructor, isNativeOfflineAudioContext, testAudioBufferCopyChannelMethodsSubarraySupport, testPromiseSupport);
    const baseAudioContextConstructor = createBaseAudioContextConstructor(addAudioWorkletModule, analyserNodeConstructor, audioBufferConstructor, audioBufferSourceNodeConstructor, biquadFilterNodeConstructor, channelMergerNodeConstructor, channelSplitterNodeConstructor, constantSourceNodeConstructor, decodeAudioData, gainNodeConstructor, iIRFilterNodeConstructor, minimalBaseAudioContextConstructor, oscillatorNodeConstructor, stereoPannerNodeConstructor, waveShaperNodeConstructor);
    const nativeAudioWorkletNodeConstructor = createNativeAudioWorkletNodeConstructor(window$1);
    const startRendering = createStartRendering(renderNativeOfflineAudioContext, testAudioBufferCopyChannelMethodsSubarraySupport);
    const offlineAudioContextConstructor = createOfflineAudioContextConstructor(baseAudioContextConstructor, createInvalidStateError, nativeOfflineAudioContextConstructor, startRendering);

    const render = (audioBuffer, offset, duration) => {
        const offlineAudioContext = new offlineAudioContextConstructor(audioBuffer.numberOfChannels, duration * audioBuffer.sampleRate, audioBuffer.sampleRate);
        const biquadFilter = offlineAudioContext.createBiquadFilter();
        const bufferSourceNode = offlineAudioContext.createBufferSource();
        biquadFilter.frequency.value = 240;
        biquadFilter.type = 'lowpass';
        bufferSourceNode.buffer = audioBuffer;
        bufferSourceNode
            .connect(biquadFilter)
            .connect(offlineAudioContext.destination);
        bufferSourceNode.start(0, offset, duration);
        return offlineAudioContext
            .startRendering()
            .then((renderedBuffer) => {
            const channelData = renderedBuffer.getChannelData(0);
            const sampleRate = renderedBuffer.sampleRate;
            return { channelData, sampleRate };
        });
    };

    const load$1 = (url) => {
        const worker = new Worker(url);
        const ongoingRecordingRequests = new Set();
        const analyze = (audioBuffer, offset = 0, duration = audioBuffer.duration - offset) => {
            return new Promise(async (resolve, reject) => {
                const { channelData, sampleRate } = await render(audioBuffer, offset, duration);
                const id = addUniqueNumber(ongoingRecordingRequests);
                const onMessage = ({ data }) => {
                    if (data.id === id) {
                        ongoingRecordingRequests.delete(id);
                        worker.removeEventListener('message', onMessage);
                        if (data.error === null) {
                            resolve(data.result.tempo);
                        }
                        else {
                            reject(new Error(data.error.message));
                        }
                    }
                };
                worker.addEventListener('message', onMessage);
                worker.postMessage({ id, method: 'analyze', params: { channelData, sampleRate } }, [channelData.buffer]);
            });
        };
        const guess = (audioBuffer, offset = 0, duration = audioBuffer.duration - offset) => {
            return new Promise(async (resolve, reject) => {
                const { channelData, sampleRate } = await render(audioBuffer, offset, duration);
                const id = addUniqueNumber(ongoingRecordingRequests);
                const onMessage = ({ data }) => {
                    if (data.id === id) {
                        ongoingRecordingRequests.delete(id);
                        worker.removeEventListener('message', onMessage);
                        if (data.error === null) {
                            resolve(data.result);
                        }
                        else {
                            reject(new Error(data.error.message));
                        }
                    }
                };
                worker.addEventListener('message', onMessage);
                worker.postMessage({ id, method: 'guess', params: { channelData, sampleRate } }, [channelData.buffer]);
            });
        };
        return {
            analyze,
            guess
        };
    };

    // tslint:disable-next-line:max-line-length
    const worker$1 = `!function(e){var t={};function n(r){if(t[r])return t[r].exports;var o=t[r]={i:r,l:!1,exports:{}};return e[r].call(o.exports,o,o.exports,n),o.l=!0,o.exports}n.m=e,n.c=t,n.d=function(e,t,r){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:r})},n.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.t=function(e,t){if(1&t&&(e=n(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var r=Object.create(null);if(n.r(r),Object.defineProperty(r,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var o in e)n.d(r,o,function(t){return e[t]}.bind(null,o));return r},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="",n(n.s=0)}([function(e,t,n){"use strict";n.r(t);const r=(e,t,n)=>{const r=e.length,o=[];let s=!1;for(let a=0;a<r;a+=1)e[a]>t?s=!0:s&&(s=!1,o.push(a-1),a+=n/4-1);return s&&o.push(r-1),o},o=(e,t)=>{const n=(e=>{let t=0;const n=e.length;for(let r=0;r<n;r+=1)e[r]>t&&(t=e[r]);return t})(e),o=.3*n;let s=[],a=n-.05*n;if(n>.25)for(;s.length<30&&a>=o;)s=r(e,a,t),a-=.05*n;const l=((e,t)=>{const n=[];return e.forEach(e=>{let r=60/(e.interval/t);for(;r<90;)r*=2;for(;r>180;)r/=2;let o=!1,s=e.peaks.length;n.forEach(t=>{if(t.tempo===r&&(t.score+=e.peaks.length,t.peaks=[...t.peaks,...e.peaks],o=!0),t.tempo>r-.5&&t.tempo<r+.5){const n=2*Math.abs(t.tempo-r);s+=(1-n)*t.peaks.length,t.score+=(1-n)*e.peaks.length}}),o||n.push({peaks:e.peaks,score:s,tempo:r})}),n})((e=>{const t=[];return e.forEach((n,r)=>{const o=Math.min(e.length-r,10);for(let s=1;s<o;s+=1){const o=e[r+s]-n;t.some(e=>e.interval===o&&(e.peaks.push(n),!0))||t.push({interval:o,peaks:[n]})}}),t})(s),t);return l.sort((e,t)=>t.score-e.score),l};addEventListener("message",e=>{let t=e.data;try{if("analyze"===t.method){const e=t.id,n=t.params,r=((e,t)=>{const n=o(e,t);if(0===n.length)throw new Error("The given channelData does not contain any detectable beats.");return n[0].tempo})(n.channelData,n.sampleRate);postMessage({error:null,id:e,result:{tempo:r}})}else{if("guess"!==t.method)throw new Error('The given method "'.concat(t.method,'" is not supported'));{const e=t.id,n=t.params,r=((e,t)=>{const n=o(e,t);if(0===n.length)throw new Error("The given channelData does not contain any detectable beats.");const r=n[0],s=r.peaks,a=r.tempo,l=Math.round(a),c=60/l;s.sort((e,t)=>e-t);let u=s[0]/t;for(;u>c;)u-=c;return{bpm:l,offset:u}})(n.channelData,n.sampleRate),s=r.bpm,a=r.offset;postMessage({error:null,id:e,result:{bpm:s,offset:a}})}}}catch(e){postMessage({error:{message:e.message},id:t.id,result:null})}})}]);`;

    const blob$1 = new Blob([worker$1], { type: 'application/javascript; charset=utf-8' });
    const url$1 = URL.createObjectURL(blob$1);
    const webAudioBeatDetector = load$1(url$1);
    const analyze = webAudioBeatDetector.analyze;
    URL.revokeObjectURL(url$1);

    function unwrapExports (x) {
    	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x.default : x;
    }

    function createCommonjsModule(fn, module) {
    	return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    var APlayer_min = createCommonjsModule(function (module, exports) {
    !function(e,t){module.exports=t();}(window,function(){return function(e){var t={};function n(i){if(t[i])return t[i].exports;var a=t[i]={i:i,l:!1,exports:{}};return e[i].call(a.exports,a,a.exports,n),a.l=!0,a.exports}return n.m=e,n.c=t,n.d=function(e,t,i){n.o(e,t)||Object.defineProperty(e,t,{configurable:!1,enumerable:!0,get:i});},n.r=function(e){Object.defineProperty(e,"__esModule",{value:!0});},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="/",n(n.s=41)}([function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i=/mobile/i.test(window.navigator.userAgent),a={secondToTime:function(e){var t=Math.floor(e/3600),n=Math.floor((e-3600*t)/60),i=Math.floor(e-3600*t-60*n);return (t>0?[t,n,i]:[n,i]).map(function(e){return e<10?"0"+e:""+e}).join(":")},getElementViewLeft:function(e){var t=e.offsetLeft,n=e.offsetParent,i=document.body.scrollLeft+document.documentElement.scrollLeft;if(document.fullscreenElement||document.mozFullScreenElement||document.webkitFullscreenElement)for(;null!==n&&n!==e;)t+=n.offsetLeft,n=n.offsetParent;else for(;null!==n;)t+=n.offsetLeft,n=n.offsetParent;return t-i},getElementViewTop:function(e,t){for(var n,i=e.offsetTop,a=e.offsetParent;null!==a;)i+=a.offsetTop,a=a.offsetParent;return n=document.body.scrollTop+document.documentElement.scrollTop,t?i:i-n},isMobile:i,storage:{set:function(e,t){localStorage.setItem(e,t);},get:function(e){return localStorage.getItem(e)}},nameMap:{dragStart:i?"touchstart":"mousedown",dragMove:i?"touchmove":"mousemove",dragEnd:i?"touchend":"mouseup"},randomOrder:function(e){return function(e){for(var t=e.length-1;t>=0;t--){var n=Math.floor(Math.random()*(t+1)),i=e[n];e[n]=e[t],e[t]=i;}return e}([].concat(function(e){if(Array.isArray(e)){for(var t=0,n=Array(e.length);t<e.length;t++)n[t]=e[t];return n}return Array.from(e)}(Array(e))).map(function(e,t){return t}))}};t.default=a;},function(e,t,n){var i=n(2);e.exports=function(e){e=e||{};var t="",n=i.$each,a=e.audio,r=(e.$value,e.$index,i.$escape),o=e.theme,s=e.index;return n(a,function(e,n){t+='\n<li>\n    <span class="aplayer-list-cur" style="background-color: ',t+=r(e.theme||o),t+=';"></span>\n    <span class="aplayer-list-index">',t+=r(n+s),t+='</span>\n    <span class="aplayer-list-title">',t+=r(e.name),t+='</span>\n    <span class="aplayer-list-author">',t+=r(e.artist),t+="</span>\n</li>\n";}),t};},function(e,t,n){e.exports=n(15);},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i=g(n(33)),a=g(n(32)),r=g(n(31)),o=g(n(30)),s=g(n(29)),l=g(n(28)),u=g(n(27)),c=g(n(26)),p=g(n(25)),d=g(n(24)),h=g(n(23)),y=g(n(22)),f=g(n(21)),v=g(n(20)),m=g(n(19));function g(e){return e&&e.__esModule?e:{default:e}}var w={play:i.default,pause:a.default,volumeUp:r.default,volumeDown:o.default,volumeOff:s.default,orderRandom:l.default,orderList:u.default,menu:c.default,loopAll:p.default,loopOne:d.default,loopNone:h.default,loading:y.default,right:f.default,skip:v.default,lrc:m.default};t.default=w;},function(e,t,n){var i,a="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e};i=function(){return this}();try{i=i||Function("return this")()||(0, eval)("this");}catch(e){"object"===("undefined"==typeof window?"undefined":a(window))&&(i=window);}e.exports=i;},function(e,t,n){var i,a,r="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e};void 0===(a="function"==typeof(i=function(){if("object"===("undefined"==typeof window?"undefined":r(window))&&void 0!==document.querySelectorAll&&void 0!==window.pageYOffset&&void 0!==history.pushState){var e=function(e,t,n,i){return n>i?t:e+(t-e)*((a=n/i)<.5?4*a*a*a:(a-1)*(2*a-2)*(2*a-2)+1);var a;},t=function(t,n,i,a){n=n||500;var r=(a=a||window).scrollTop||window.pageYOffset;if("number"==typeof t)var o=parseInt(t);else var o=function(e,t){return "HTML"===e.nodeName?-t:e.getBoundingClientRect().top+t}(t,r);var s=Date.now(),l=window.requestAnimationFrame||window.mozRequestAnimationFrame||window.webkitRequestAnimationFrame||function(e){window.setTimeout(e,15);};!function u(){var c=Date.now()-s;a!==window?a.scrollTop=e(r,o,c,n):window.scroll(0,e(r,o,c,n)),c>n?"function"==typeof i&&i(t):l(u);}();},n=function(e){if(!e.defaultPrevented){e.preventDefault(),location.hash!==this.hash&&window.history.pushState(null,null,this.hash);var n=document.getElementById(this.hash.substring(1));if(!n)return;t(n,500,function(e){location.replace("#"+e.id);});}};return document.addEventListener("DOMContentLoaded",function(){for(var e,t=document.querySelectorAll('a[href^="#"]:not([href="#"])'),i=t.length;e=t[--i];)e.addEventListener("click",n,!1);}),t}})?i.call(t,n,t,e):i)||(e.exports=a);},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i=function(){function e(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i);}}return function(t,n,i){return n&&e(t.prototype,n),i&&e(t,i),t}}(),a=s(n(1)),r=s(n(0)),o=s(n(5));function s(e){return e&&e.__esModule?e:{default:e}}var l=function(){function e(t){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.player=t,this.index=0,this.audios=this.player.options.audio,this.bindEvents();}return i(e,[{key:"bindEvents",value:function(){var e=this;this.player.template.list.addEventListener("click",function(t){var n=void 0;n="LI"===t.target.tagName.toUpperCase()?t.target:t.target.parentElement;var i=parseInt(n.getElementsByClassName("aplayer-list-index")[0].innerHTML)-1;i!==e.index?(e.switch(i),e.player.play()):e.player.toggle();});}},{key:"show",value:function(){this.player.events.trigger("listshow"),this.player.template.list.classList.remove("aplayer-list-hide"),this.player.template.listOl.scrollTop=33*this.index;}},{key:"hide",value:function(){this.player.events.trigger("listhide"),this.player.template.list.classList.add("aplayer-list-hide");}},{key:"toggle",value:function(){this.player.template.list.classList.contains("aplayer-list-hide")?this.show():this.hide();}},{key:"add",value:function(e){this.player.events.trigger("listadd",{audios:e}),"[object Array]"!==Object.prototype.toString.call(e)&&(e=[e]),e.map(function(e){return e.name=e.name||e.title||"Audio name",e.artist=e.artist||e.author||"Audio artist",e.cover=e.cover||e.pic,e.type=e.type||"normal",e});var t=!(this.audios.length>1),n=0===this.audios.length;this.player.template.listOl.innerHTML+=(0, a.default)({theme:this.player.options.theme,audio:e,index:this.audios.length+1}),this.audios=this.audios.concat(e),t&&this.audios.length>1&&this.player.container.classList.add("aplayer-withlist"),this.player.randomOrder=r.default.randomOrder(this.audios.length),this.player.template.listCurs=this.player.container.querySelectorAll(".aplayer-list-cur"),this.player.template.listCurs[this.audios.length-1].style.backgroundColor=e.theme||this.player.options.theme,n&&("random"===this.player.options.order?this.switch(this.player.randomOrder[0]):this.switch(0));}},{key:"remove",value:function(e){if(this.player.events.trigger("listremove",{index:e}),this.audios[e])if(this.audios.length>1){var t=this.player.container.querySelectorAll(".aplayer-list li");t[e].remove(),this.audios.splice(e,1),this.player.lrc&&this.player.lrc.remove(e),e===this.index&&(this.audios[e]?this.switch(e):this.switch(e-1)),this.index>e&&this.index--;for(var n=e;n<t.length;n++)t[n].getElementsByClassName("aplayer-list-index")[0].textContent=n;1===this.audios.length&&this.player.container.classList.remove("aplayer-withlist"),this.player.template.listCurs=this.player.container.querySelectorAll(".aplayer-list-cur");}else this.clear();}},{key:"switch",value:function(e){if(this.player.events.trigger("listswitch",{index:e}),void 0!==e&&this.audios[e]){this.index=e;var t=this.audios[this.index];this.player.template.pic.style.backgroundImage=t.cover?"url('"+t.cover+"')":"",this.player.theme(this.audios[this.index].theme||this.player.options.theme,this.index,!1),this.player.template.title.innerHTML=t.name,this.player.template.author.innerHTML=t.artist?" - "+t.artist:"";var n=this.player.container.getElementsByClassName("aplayer-list-light")[0];n&&n.classList.remove("aplayer-list-light"),this.player.container.querySelectorAll(".aplayer-list li")[this.index].classList.add("aplayer-list-light"),(0, o.default)(33*this.index,500,null,this.player.template.listOl),this.player.setAudio(t),this.player.lrc&&this.player.lrc.switch(this.index),this.player.lrc&&this.player.lrc.update(0),1!==this.player.duration&&(this.player.template.dtime.innerHTML=r.default.secondToTime(this.player.duration));}}},{key:"clear",value:function(){this.player.events.trigger("listclear"),this.index=0,this.player.container.classList.remove("aplayer-withlist"),this.player.pause(),this.audios=[],this.player.lrc&&this.player.lrc.clear(),this.player.audio.src="",this.player.template.listOl.innerHTML="",this.player.template.pic.style.backgroundImage="",this.player.theme(this.player.options.theme,this.index,!1),this.player.template.title.innerHTML="No audio",this.player.template.author.innerHTML="",this.player.bar.set("loaded",0,"width"),this.player.template.dtime.innerHTML=r.default.secondToTime(0);}}]),e}();t.default=l;},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i=function(){function e(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i);}}return function(t,n,i){return n&&e(t.prototype,n),i&&e(t,i),t}}();var a=function(){function e(){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.events={},this.audioEvents=["abort","canplay","canplaythrough","durationchange","emptied","ended","error","loadeddata","loadedmetadata","loadstart","mozaudioavailable","pause","play","playing","progress","ratechange","seeked","seeking","stalled","suspend","timeupdate","volumechange","waiting"],this.playerEvents=["destroy","listshow","listhide","listadd","listremove","listswitch","listclear","noticeshow","noticehide","lrcshow","lrchide"];}return i(e,[{key:"on",value:function(e,t){this.type(e)&&"function"==typeof t&&(this.events[e]||(this.events[e]=[]),this.events[e].push(t));}},{key:"trigger",value:function(e,t){if(this.events[e]&&this.events[e].length)for(var n=0;n<this.events[e].length;n++)this.events[e][n](t);}},{key:"type",value:function(e){return -1!==this.playerEvents.indexOf(e)?"player":-1!==this.audioEvents.indexOf(e)?"audio":(console.error("Unknown event name: "+e),null)}}]),e}();t.default=a;},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i=function(){function e(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i);}}return function(t,n,i){return n&&e(t.prototype,n),i&&e(t,i),t}}();var a=function(){function e(t){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.player=t,window.requestAnimationFrame=window.requestAnimationFrame||window.webkitRequestAnimationFrame||window.mozRequestAnimationFrame||window.oRequestAnimationFrame||window.msRequestAnimationFrame||function(e){window.setTimeout(e,1e3/60);},this.types=["loading"],this.init();}return i(e,[{key:"init",value:function(){var e=this;this.types.forEach(function(t){e["init"+t+"Checker"]();});}},{key:"initloadingChecker",value:function(){var e=this,t=0,n=0,i=!1;this.loadingChecker=setInterval(function(){e.enableloadingChecker&&(n=e.player.audio.currentTime,i||n!==t||e.player.audio.paused||(e.player.container.classList.add("aplayer-loading"),i=!0),i&&n>t&&!e.player.audio.paused&&(e.player.container.classList.remove("aplayer-loading"),i=!1),t=n);},100);}},{key:"enable",value:function(e){this["enable"+e+"Checker"]=!0,"fps"===e&&this.initfpsChecker();}},{key:"disable",value:function(e){this["enable"+e+"Checker"]=!1;}},{key:"destroy",value:function(){var e=this;this.types.forEach(function(t){e["enable"+t+"Checker"]=!1,e[t+"Checker"]&&clearInterval(e[t+"Checker"]);});}}]),e}();t.default=a;},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i=function(){function e(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i);}}return function(t,n,i){return n&&e(t.prototype,n),i&&e(t,i),t}}(),a=o(n(0)),r=o(n(3));function o(e){return e&&e.__esModule?e:{default:e}}var s=function(){function e(t){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.player=t,this.initPlayButton(),this.initPlayBar(),this.initOrderButton(),this.initLoopButton(),this.initMenuButton(),a.default.isMobile||this.initVolumeButton(),this.initMiniSwitcher(),this.initSkipButton(),this.initLrcButton();}return i(e,[{key:"initPlayButton",value:function(){var e=this;this.player.template.pic.addEventListener("click",function(){e.player.toggle();});}},{key:"initPlayBar",value:function(){var e=this,t=function(t){var n=((t.clientX||t.changedTouches[0].clientX)-a.default.getElementViewLeft(e.player.template.barWrap))/e.player.template.barWrap.clientWidth;n=Math.max(n,0),n=Math.min(n,1),e.player.bar.set("played",n,"width"),e.player.lrc&&e.player.lrc.update(n*e.player.duration),e.player.template.ptime.innerHTML=a.default.secondToTime(n*e.player.duration);},n=function n(i){document.removeEventListener(a.default.nameMap.dragEnd,n),document.removeEventListener(a.default.nameMap.dragMove,t);var r=((i.clientX||i.changedTouches[0].clientX)-a.default.getElementViewLeft(e.player.template.barWrap))/e.player.template.barWrap.clientWidth;r=Math.max(r,0),r=Math.min(r,1),e.player.bar.set("played",r,"width"),e.player.seek(e.player.bar.get("played","width")*e.player.duration),e.player.disableTimeupdate=!1;};this.player.template.barWrap.addEventListener(a.default.nameMap.dragStart,function(){e.player.disableTimeupdate=!0,document.addEventListener(a.default.nameMap.dragMove,t),document.addEventListener(a.default.nameMap.dragEnd,n);});}},{key:"initVolumeButton",value:function(){var e=this;this.player.template.volumeButton.addEventListener("click",function(){e.player.audio.muted?(e.player.audio.muted=!1,e.player.switchVolumeIcon(),e.player.bar.set("volume",e.player.volume(),"height")):(e.player.audio.muted=!0,e.player.switchVolumeIcon(),e.player.bar.set("volume",0,"height"));});var t=function(t){var n=1-((t.clientY||t.changedTouches[0].clientY)-a.default.getElementViewTop(e.player.template.volumeBar,e.player.options.fixed))/e.player.template.volumeBar.clientHeight;n=Math.max(n,0),n=Math.min(n,1),e.player.volume(n);},n=function n(i){e.player.template.volumeBarWrap.classList.remove("aplayer-volume-bar-wrap-active"),document.removeEventListener(a.default.nameMap.dragEnd,n),document.removeEventListener(a.default.nameMap.dragMove,t);var r=1-((i.clientY||i.changedTouches[0].clientY)-a.default.getElementViewTop(e.player.template.volumeBar,e.player.options.fixed))/e.player.template.volumeBar.clientHeight;r=Math.max(r,0),r=Math.min(r,1),e.player.volume(r);};this.player.template.volumeBarWrap.addEventListener(a.default.nameMap.dragStart,function(){e.player.template.volumeBarWrap.classList.add("aplayer-volume-bar-wrap-active"),document.addEventListener(a.default.nameMap.dragMove,t),document.addEventListener(a.default.nameMap.dragEnd,n);});}},{key:"initOrderButton",value:function(){var e=this;this.player.template.order.addEventListener("click",function(){"list"===e.player.options.order?(e.player.options.order="random",e.player.template.order.innerHTML=r.default.orderRandom):"random"===e.player.options.order&&(e.player.options.order="list",e.player.template.order.innerHTML=r.default.orderList);});}},{key:"initLoopButton",value:function(){var e=this;this.player.template.loop.addEventListener("click",function(){e.player.list.audios.length>1?"one"===e.player.options.loop?(e.player.options.loop="none",e.player.template.loop.innerHTML=r.default.loopNone):"none"===e.player.options.loop?(e.player.options.loop="all",e.player.template.loop.innerHTML=r.default.loopAll):"all"===e.player.options.loop&&(e.player.options.loop="one",e.player.template.loop.innerHTML=r.default.loopOne):"one"===e.player.options.loop||"all"===e.player.options.loop?(e.player.options.loop="none",e.player.template.loop.innerHTML=r.default.loopNone):"none"===e.player.options.loop&&(e.player.options.loop="all",e.player.template.loop.innerHTML=r.default.loopAll);});}},{key:"initMenuButton",value:function(){var e=this;this.player.template.menu.addEventListener("click",function(){e.player.list.toggle();});}},{key:"initMiniSwitcher",value:function(){var e=this;this.player.template.miniSwitcher.addEventListener("click",function(){e.player.setMode("mini"===e.player.mode?"normal":"mini");});}},{key:"initSkipButton",value:function(){var e=this;this.player.template.skipBackButton.addEventListener("click",function(){e.player.skipBack();}),this.player.template.skipForwardButton.addEventListener("click",function(){e.player.skipForward();}),this.player.template.skipPlayButton.addEventListener("click",function(){e.player.toggle();});}},{key:"initLrcButton",value:function(){var e=this;this.player.template.lrcButton.addEventListener("click",function(){e.player.template.lrcButton.classList.contains("aplayer-icon-lrc-inactivity")?(e.player.template.lrcButton.classList.remove("aplayer-icon-lrc-inactivity"),e.player.lrc&&e.player.lrc.show()):(e.player.template.lrcButton.classList.add("aplayer-icon-lrc-inactivity"),e.player.lrc&&e.player.lrc.hide());});}}]),e}();t.default=s;},function(e,t,n){var i=n(2);e.exports=function(e){e=e||{};var t="",n=i.$each,a=e.lyrics,r=(e.$value,e.$index,i.$escape);return n(a,function(e,n){t+="\n    <p",0===n&&(t+=' class="aplayer-lrc-current"'),t+=">",t+=r(e[1]),t+="</p>\n";}),t};},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i,a=function(){function e(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i);}}return function(t,n,i){return n&&e(t.prototype,n),i&&e(t,i),t}}(),r=n(10),o=(i=r)&&i.__esModule?i:{default:i};var s=function(){function e(t){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.container=t.container,this.async=t.async,this.player=t.player,this.parsed=[],this.index=0,this.current=[];}return a(e,[{key:"show",value:function(){this.player.events.trigger("lrcshow"),this.player.template.lrcWrap.classList.remove("aplayer-lrc-hide");}},{key:"hide",value:function(){this.player.events.trigger("lrchide"),this.player.template.lrcWrap.classList.add("aplayer-lrc-hide");}},{key:"toggle",value:function(){this.player.template.lrcWrap.classList.contains("aplayer-lrc-hide")?this.show():this.hide();}},{key:"update",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:this.player.audio.currentTime;if(this.index>this.current.length-1||e<this.current[this.index][0]||!this.current[this.index+1]||e>=this.current[this.index+1][0])for(var t=0;t<this.current.length;t++)e>=this.current[t][0]&&(!this.current[t+1]||e<this.current[t+1][0])&&(this.index=t,this.container.style.transform="translateY("+16*-this.index+"px)",this.container.style.webkitTransform="translateY("+16*-this.index+"px)",this.container.getElementsByClassName("aplayer-lrc-current")[0].classList.remove("aplayer-lrc-current"),this.container.getElementsByTagName("p")[t].classList.add("aplayer-lrc-current"));}},{key:"switch",value:function(e){var t=this;if(!this.parsed[e])if(this.async){this.parsed[e]=[["00:00","Loading"]];var n=new XMLHttpRequest;n.onreadystatechange=function(){e===t.player.list.index&&4===n.readyState&&(n.status>=200&&n.status<300||304===n.status?t.parsed[e]=t.parse(n.responseText):(t.player.notice("LRC file request fails: status "+n.status),t.parsed[e]=[["00:00","Not available"]]),t.container.innerHTML=(0, o.default)({lyrics:t.parsed[e]}),t.update(0),t.current=t.parsed[e]);};var i=this.player.list.audios[e].lrc;n.open("get",i,!0),n.send(null);}else this.player.list.audios[e].lrc?this.parsed[e]=this.parse(this.player.list.audios[e].lrc):this.parsed[e]=[["00:00","Not available"]];this.container.innerHTML=(0, o.default)({lyrics:this.parsed[e]}),this.update(0),this.current=this.parsed[e];}},{key:"parse",value:function(e){if(e){for(var t=(e=e.replace(/([^\]^\n])\[/g,function(e,t){return t+"\n["})).split("\n"),n=[],i=t.length,a=0;a<i;a++){var r=t[a].match(/\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/g),o=t[a].replace(/.*\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/g,"").replace(/<(\d{2}):(\d{2})(\.(\d{2,3}))?>/g,"").replace(/^\s+|\s+$/g,"");if(r)for(var s=r.length,l=0;l<s;l++){var u=/\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/.exec(r[l]),c=60*u[1]+parseInt(u[2])+(u[4]?parseInt(u[4])/(2===(u[4]+"").length?100:1e3):0);n.push([c,o]);}}return (n=n.filter(function(e){return e[1]})).sort(function(e,t){return e[0]-t[0]}),n}return []}},{key:"remove",value:function(e){this.parsed.splice(e,1);}},{key:"clear",value:function(){this.parsed=[],this.container.innerHTML="";}}]),e}();t.default=s;},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i,a=function(){function e(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i);}}return function(t,n,i){return n&&e(t.prototype,n),i&&e(t,i),t}}(),r=n(0),o=(i=r)&&i.__esModule?i:{default:i};var s=function(){function e(t){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.storageName=t.options.storageName,this.data=JSON.parse(o.default.storage.get(this.storageName)),this.data||(this.data={}),this.data.volume=this.data.volume||t.options.volume;}return a(e,[{key:"get",value:function(e){return this.data[e]}},{key:"set",value:function(e,t){this.data[e]=t,o.default.storage.set(this.storageName,JSON.stringify(this.data));}}]),e}();t.default=s;},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i=function(){function e(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i);}}return function(t,n,i){return n&&e(t.prototype,n),i&&e(t,i),t}}();var a=function(){function e(t){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.elements={},this.elements.volume=t.volume,this.elements.played=t.played,this.elements.loaded=t.loaded;}return i(e,[{key:"set",value:function(e,t,n){t=Math.max(t,0),t=Math.min(t,1),this.elements[e].style[n]=100*t+"%";}},{key:"get",value:function(e,t){return parseFloat(this.elements[e].style[t])/100}}]),e}();t.default=a;},function(e,t,n){(function(t){e.exports=!1;try{e.exports="[object process]"===Object.prototype.toString.call(t.process);}catch(e){}}).call(this,n(4));},function(e,t,n){(function(t){var i=n(14),a=Object.create(i?t:window),r=/["&'<>]/;a.$escape=function(e){return function(e){var t=""+e,n=r.exec(t);if(!n)return e;var i="",a=void 0,o=void 0,s=void 0;for(a=n.index,o=0;a<t.length;a++){switch(t.charCodeAt(a)){case 34:s="&#34;";break;case 38:s="&#38;";break;case 39:s="&#39;";break;case 60:s="&#60;";break;case 62:s="&#62;";break;default:continue}o!==a&&(i+=t.substring(o,a)),o=a+1,i+=s;}return o!==a?i+t.substring(o,a):i}(function e(t){"string"!=typeof t&&(t=void 0===t||null===t?"":"function"==typeof t?e(t.call(t)):JSON.stringify(t));return t}(e))},a.$each=function(e,t){if(Array.isArray(e))for(var n=0,i=e.length;n<i;n++)t(e[n],n);else for(var a in e)t(e[a],a);},e.exports=a;}).call(this,n(4));},function(e,t,n){var i=n(2);e.exports=function(e){var t="",a=(e=e||{}).options,r=e.cover,o=i.$escape,s=e.icons,l=(function(e){return t+=e}),u=e.getObject;e.theme,e.audio,e.index;return a.fixed?(t+='\n<div class="aplayer-list',a.listFolded&&(t+=" aplayer-list-hide"),t+='"',a.listMaxHeight&&(t+=' style="max-height: ',t+=o(a.listMaxHeight),t+='"'),t+=">\n    <ol",a.listMaxHeight&&(t+=' style="max-height: ',t+=o(a.listMaxHeight),t+='"'),t+=">\n        ",l(n(1)(u({theme:a.theme,audio:a.audio,index:1}))),t+='\n    </ol>\n</div>\n<div class="aplayer-body">\n    <div class="aplayer-pic" style="',r&&(t+="background-image: url(&quot;",t+=o(r),t+="&quot;);"),t+="background-color: ",t+=o(a.theme),t+=';">\n        <div class="aplayer-button aplayer-play">',t+=s.play,t+='</div>\n    </div>\n    <div class="aplayer-info" style="display: none;">\n        <div class="aplayer-music">\n            <span class="aplayer-title">No audio</span>\n            <span class="aplayer-author"></span>\n        </div>\n        <div class="aplayer-controller">\n            <div class="aplayer-bar-wrap">\n                <div class="aplayer-bar">\n                    <div class="aplayer-loaded" style="width: 0"></div>\n                    <div class="aplayer-played" style="width: 0; background: ',t+=o(a.theme),t+=';">\n                        <span class="aplayer-thumb" style="background: ',t+=o(a.theme),t+=';">\n                            <span class="aplayer-loading-icon">',t+=s.loading,t+='</span>\n                        </span>\n                    </div>\n                </div>\n            </div>\n            <div class="aplayer-time">\n                <span class="aplayer-time-inner">\n                    <span class="aplayer-ptime">00:00</span> / <span class="aplayer-dtime">00:00</span>\n                </span>\n                <span class="aplayer-icon aplayer-icon-back">\n                    ',t+=s.skip,t+='\n                </span>\n                <span class="aplayer-icon aplayer-icon-play">\n                    ',t+=s.play,t+='\n                </span>\n                <span class="aplayer-icon aplayer-icon-forward">\n                    ',t+=s.skip,t+='\n                </span>\n                <div class="aplayer-volume-wrap">\n                    <button type="button" class="aplayer-icon aplayer-icon-volume-down">\n                        ',t+=s.volumeDown,t+='\n                    </button>\n                    <div class="aplayer-volume-bar-wrap">\n                        <div class="aplayer-volume-bar">\n                            <div class="aplayer-volume" style="height: 80%; background: ',t+=o(a.theme),t+=';"></div>\n                        </div>\n                    </div>\n                </div>\n                <button type="button" class="aplayer-icon aplayer-icon-order">\n                    ',"list"===a.order?t+=s.orderList:"random"===a.order&&(t+=s.orderRandom),t+='\n                </button>\n                <button type="button" class="aplayer-icon aplayer-icon-loop">\n                    ',"one"===a.loop?t+=s.loopOne:"all"===a.loop?t+=s.loopAll:"none"===a.loop&&(t+=s.loopNone),t+='\n                </button>\n                <button type="button" class="aplayer-icon aplayer-icon-menu">\n                    ',t+=s.menu,t+='\n                </button>\n                <button type="button" class="aplayer-icon aplayer-icon-lrc">\n                    ',t+=s.lrc,t+='\n                </button>\n            </div>\n        </div>\n    </div>\n    <div class="aplayer-notice"></div>\n    <div class="aplayer-miniswitcher"><button class="aplayer-icon">',t+=s.right,t+='</button></div>\n</div>\n<div class="aplayer-lrc">\n    <div class="aplayer-lrc-contents" style="transform: translateY(0); -webkit-transform: translateY(0);"></div>\n</div>\n'):(t+='\n<div class="aplayer-body">\n    <div class="aplayer-pic" style="',r&&(t+="background-image: url(&quot;",t+=o(r),t+="&quot;);"),t+="background-color: ",t+=o(a.theme),t+=';">\n        <div class="aplayer-button aplayer-play">',t+=s.play,t+='</div>\n    </div>\n    <div class="aplayer-info">\n        <div class="aplayer-music">\n            <span class="aplayer-title">No audio</span>\n            <span class="aplayer-author"></span>\n        </div>\n        <div class="aplayer-lrc">\n            <div class="aplayer-lrc-contents" style="transform: translateY(0); -webkit-transform: translateY(0);"></div>\n        </div>\n        <div class="aplayer-controller">\n            <div class="aplayer-bar-wrap">\n                <div class="aplayer-bar">\n                    <div class="aplayer-loaded" style="width: 0"></div>\n                    <div class="aplayer-played" style="width: 0; background: ',t+=o(a.theme),t+=';">\n                        <span class="aplayer-thumb" style="background: ',t+=o(a.theme),t+=';">\n                            <span class="aplayer-loading-icon">',t+=s.loading,t+='</span>\n                        </span>\n                    </div>\n                </div>\n            </div>\n            <div class="aplayer-time">\n                <span class="aplayer-time-inner">\n                    <span class="aplayer-ptime">00:00</span> / <span class="aplayer-dtime">00:00</span>\n                </span>\n                <span class="aplayer-icon aplayer-icon-back">\n                    ',t+=s.skip,t+='\n                </span>\n                <span class="aplayer-icon aplayer-icon-play">\n                    ',t+=s.play,t+='\n                </span>\n                <span class="aplayer-icon aplayer-icon-forward">\n                    ',t+=s.skip,t+='\n                </span>\n                <div class="aplayer-volume-wrap">\n                    <button type="button" class="aplayer-icon aplayer-icon-volume-down">\n                        ',t+=s.volumeDown,t+='\n                    </button>\n                    <div class="aplayer-volume-bar-wrap">\n                        <div class="aplayer-volume-bar">\n                            <div class="aplayer-volume" style="height: 80%; background: ',t+=o(a.theme),t+=';"></div>\n                        </div>\n                    </div>\n                </div>\n                <button type="button" class="aplayer-icon aplayer-icon-order">\n                    ',"list"===a.order?t+=s.orderList:"random"===a.order&&(t+=s.orderRandom),t+='\n                </button>\n                <button type="button" class="aplayer-icon aplayer-icon-loop">\n                    ',"one"===a.loop?t+=s.loopOne:"all"===a.loop?t+=s.loopAll:"none"===a.loop&&(t+=s.loopNone),t+='\n                </button>\n                <button type="button" class="aplayer-icon aplayer-icon-menu">\n                    ',t+=s.menu,t+='\n                </button>\n                <button type="button" class="aplayer-icon aplayer-icon-lrc">\n                    ',t+=s.lrc,t+='\n                </button>\n            </div>\n        </div>\n    </div>\n    <div class="aplayer-notice"></div>\n    <div class="aplayer-miniswitcher"><button class="aplayer-icon">',t+=s.right,t+='</button></div>\n</div>\n<div class="aplayer-list',a.listFolded&&(t+=" aplayer-list-hide"),t+='"',a.listMaxHeight&&(t+=' style="max-height: ',t+=o(a.listMaxHeight),t+='"'),t+=">\n    <ol",a.listMaxHeight&&(t+=' style="max-height: ',t+=o(a.listMaxHeight),t+='"'),t+=">\n        ",l(n(1)(u({theme:a.theme,audio:a.audio,index:1}))),t+="\n    </ol>\n</div>\n"),t};},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i=function(){function e(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i);}}return function(t,n,i){return n&&e(t.prototype,n),i&&e(t,i),t}}(),a=o(n(3)),r=o(n(16));function o(e){return e&&e.__esModule?e:{default:e}}var s=function(){function e(t){!function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.container=t.container,this.options=t.options,this.randomOrder=t.randomOrder,this.init();}return i(e,[{key:"init",value:function(){var e="";this.options.audio.length&&(e="random"===this.options.order?this.options.audio[this.randomOrder[0]].cover:this.options.audio[0].cover),this.container.innerHTML=(0, r.default)({options:this.options,icons:a.default,cover:e,getObject:function(e){return e}}),this.lrc=this.container.querySelector(".aplayer-lrc-contents"),this.lrcWrap=this.container.querySelector(".aplayer-lrc"),this.ptime=this.container.querySelector(".aplayer-ptime"),this.info=this.container.querySelector(".aplayer-info"),this.time=this.container.querySelector(".aplayer-time"),this.barWrap=this.container.querySelector(".aplayer-bar-wrap"),this.button=this.container.querySelector(".aplayer-button"),this.body=this.container.querySelector(".aplayer-body"),this.list=this.container.querySelector(".aplayer-list"),this.listOl=this.container.querySelector(".aplayer-list ol"),this.listCurs=this.container.querySelectorAll(".aplayer-list-cur"),this.played=this.container.querySelector(".aplayer-played"),this.loaded=this.container.querySelector(".aplayer-loaded"),this.thumb=this.container.querySelector(".aplayer-thumb"),this.volume=this.container.querySelector(".aplayer-volume"),this.volumeBar=this.container.querySelector(".aplayer-volume-bar"),this.volumeButton=this.container.querySelector(".aplayer-time button"),this.volumeBarWrap=this.container.querySelector(".aplayer-volume-bar-wrap"),this.loop=this.container.querySelector(".aplayer-icon-loop"),this.order=this.container.querySelector(".aplayer-icon-order"),this.menu=this.container.querySelector(".aplayer-icon-menu"),this.pic=this.container.querySelector(".aplayer-pic"),this.title=this.container.querySelector(".aplayer-title"),this.author=this.container.querySelector(".aplayer-author"),this.dtime=this.container.querySelector(".aplayer-dtime"),this.notice=this.container.querySelector(".aplayer-notice"),this.miniSwitcher=this.container.querySelector(".aplayer-miniswitcher"),this.skipBackButton=this.container.querySelector(".aplayer-icon-back"),this.skipForwardButton=this.container.querySelector(".aplayer-icon-forward"),this.skipPlayButton=this.container.querySelector(".aplayer-icon-play"),this.lrcButton=this.container.querySelector(".aplayer-icon-lrc");}}]),e}();t.default=s;},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0}),t.default=function(e){var t={container:e.element||document.getElementsByClassName("aplayer")[0],mini:e.narrow||e.fixed||!1,fixed:!1,autoplay:!1,mutex:!0,lrcType:e.showlrc||e.lrc||0,preload:"auto",theme:"#b7daff",loop:"all",order:"list",volume:.7,listFolded:e.fixed,listMaxHeight:e.listmaxheight||"250px",audio:e.music||[],storageName:"aplayer-setting"};for(var n in t)t.hasOwnProperty(n)&&!e.hasOwnProperty(n)&&(e[n]=t[n]);return "[object Array]"!==Object.prototype.toString.call(e.audio)&&(e.audio=[e.audio]),e.audio.map(function(e){return e.name=e.name||e.title||"Audio name",e.artist=e.artist||e.author||"Audio artist",e.cover=e.cover||e.pic,e.type=e.type||"normal",e}),e.audio.length<=1&&"one"===e.loop&&(e.loop="all"),e};},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 32 32"><path d="M26.667 5.333h-21.333c-0 0-0.001 0-0.001 0-1.472 0-2.666 1.194-2.666 2.666 0 0 0 0.001 0 0.001v-0 16c0 0 0 0.001 0 0.001 0 1.472 1.194 2.666 2.666 2.666 0 0 0.001 0 0.001 0h21.333c0 0 0.001 0 0.001 0 1.472 0 2.666-1.194 2.666-2.666 0-0 0-0.001 0-0.001v0-16c0-0 0-0.001 0-0.001 0-1.472-1.194-2.666-2.666-2.666-0 0-0.001 0-0.001 0h0zM5.333 16h5.333v2.667h-5.333v-2.667zM18.667 24h-13.333v-2.667h13.333v2.667zM26.667 24h-5.333v-2.667h5.333v2.667zM26.667 18.667h-13.333v-2.667h13.333v2.667z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 32 32"><path d="M25.468 6.947c-0.326-0.172-0.724-0.151-1.030 0.057l-6.438 4.38v-3.553c0-0.371-0.205-0.71-0.532-0.884-0.326-0.172-0.724-0.151-1.030 0.057l-12 8.164c-0.274 0.186-0.438 0.496-0.438 0.827s0.164 0.641 0.438 0.827l12 8.168c0.169 0.115 0.365 0.174 0.562 0.174 0.16 0 0.321-0.038 0.468-0.116 0.327-0.173 0.532-0.514 0.532-0.884v-3.556l6.438 4.382c0.169 0.115 0.365 0.174 0.562 0.174 0.16 0 0.321-0.038 0.468-0.116 0.327-0.173 0.532-0.514 0.532-0.884v-16.333c0-0.371-0.205-0.71-0.532-0.884z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 32 32"><path d="M22 16l-10.105-10.6-1.895 1.987 8.211 8.613-8.211 8.612 1.895 1.988 8.211-8.613z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 32 32"><path d="M4 16c0-6.6 5.4-12 12-12s12 5.4 12 12c0 1.2-0.8 2-2 2s-2-0.8-2-2c0-4.4-3.6-8-8-8s-8 3.6-8 8 3.6 8 8 8c1.2 0 2 0.8 2 2s-0.8 2-2 2c-6.6 0-12-5.4-12-12z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 29 32"><path d="M2.667 7.027l1.707-1.693 22.293 22.293-1.693 1.707-4-4h-11.64v4l-5.333-5.333 5.333-5.333v4h8.973l-8.973-8.973v0.973h-2.667v-3.64l-4-4zM22.667 17.333h2.667v5.573l-2.667-2.667v-2.907zM22.667 6.667v-4l5.333 5.333-5.333 5.333v-4h-10.907l-2.667-2.667h13.573z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 33 32"><path d="M9.333 9.333h13.333v4l5.333-5.333-5.333-5.333v4h-16v8h2.667v-5.333zM22.667 22.667h-13.333v-4l-5.333 5.333 5.333 5.333v-4h16v-8h-2.667v5.333zM17.333 20v-8h-1.333l-2.667 1.333v1.333h2v5.333h2z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 29 32"><path d="M9.333 9.333h13.333v4l5.333-5.333-5.333-5.333v4h-16v8h2.667v-5.333zM22.667 22.667h-13.333v-4l-5.333 5.333 5.333 5.333v-4h16v-8h-2.667v5.333z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 22 32"><path d="M20.8 14.4q0.704 0 1.152 0.48t0.448 1.12-0.48 1.12-1.12 0.48h-19.2q-0.64 0-1.12-0.48t-0.48-1.12 0.448-1.12 1.152-0.48h19.2zM1.6 11.2q-0.64 0-1.12-0.48t-0.48-1.12 0.448-1.12 1.152-0.48h19.2q0.704 0 1.152 0.48t0.448 1.12-0.48 1.12-1.12 0.48h-19.2zM20.8 20.8q0.704 0 1.152 0.48t0.448 1.12-0.48 1.12-1.12 0.48h-19.2q-0.64 0-1.12-0.48t-0.48-1.12 0.448-1.12 1.152-0.48h19.2z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 32 32"><path d="M0.622 18.334h19.54v7.55l11.052-9.412-11.052-9.413v7.549h-19.54v3.725z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 32 32"><path d="M22.667 4l7 6-7 6 7 6-7 6v-4h-3.653l-3.76-3.76 2.827-2.827 2.587 2.587h2v-8h-2l-12 12h-6v-4h4.347l12-12h3.653v-4zM2.667 8h6l3.76 3.76-2.827 2.827-2.587-2.587h-4.347v-4z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 28 32"><path d="M13.728 6.272v19.456q0 0.448-0.352 0.8t-0.8 0.32-0.8-0.32l-5.952-5.952h-4.672q-0.48 0-0.8-0.352t-0.352-0.8v-6.848q0-0.48 0.352-0.8t0.8-0.352h4.672l5.952-5.952q0.32-0.32 0.8-0.32t0.8 0.32 0.352 0.8z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 28 32"><path d="M13.728 6.272v19.456q0 0.448-0.352 0.8t-0.8 0.32-0.8-0.32l-5.952-5.952h-4.672q-0.48 0-0.8-0.352t-0.352-0.8v-6.848q0-0.48 0.352-0.8t0.8-0.352h4.672l5.952-5.952q0.32-0.32 0.8-0.32t0.8 0.32 0.352 0.8zM20.576 16q0 1.344-0.768 2.528t-2.016 1.664q-0.16 0.096-0.448 0.096-0.448 0-0.8-0.32t-0.32-0.832q0-0.384 0.192-0.64t0.544-0.448 0.608-0.384 0.512-0.64 0.192-1.024-0.192-1.024-0.512-0.64-0.608-0.384-0.544-0.448-0.192-0.64q0-0.48 0.32-0.832t0.8-0.32q0.288 0 0.448 0.096 1.248 0.48 2.016 1.664t0.768 2.528z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 28 32"><path d="M13.728 6.272v19.456q0 0.448-0.352 0.8t-0.8 0.32-0.8-0.32l-5.952-5.952h-4.672q-0.48 0-0.8-0.352t-0.352-0.8v-6.848q0-0.48 0.352-0.8t0.8-0.352h4.672l5.952-5.952q0.32-0.32 0.8-0.32t0.8 0.32 0.352 0.8zM20.576 16q0 1.344-0.768 2.528t-2.016 1.664q-0.16 0.096-0.448 0.096-0.448 0-0.8-0.32t-0.32-0.832q0-0.384 0.192-0.64t0.544-0.448 0.608-0.384 0.512-0.64 0.192-1.024-0.192-1.024-0.512-0.64-0.608-0.384-0.544-0.448-0.192-0.64q0-0.48 0.32-0.832t0.8-0.32q0.288 0 0.448 0.096 1.248 0.48 2.016 1.664t0.768 2.528zM25.152 16q0 2.72-1.536 5.056t-4 3.36q-0.256 0.096-0.448 0.096-0.48 0-0.832-0.352t-0.32-0.8q0-0.704 0.672-1.056 1.024-0.512 1.376-0.8 1.312-0.96 2.048-2.4t0.736-3.104-0.736-3.104-2.048-2.4q-0.352-0.288-1.376-0.8-0.672-0.352-0.672-1.056 0-0.448 0.32-0.8t0.8-0.352q0.224 0 0.48 0.096 2.496 1.056 4 3.36t1.536 5.056zM29.728 16q0 4.096-2.272 7.552t-6.048 5.056q-0.224 0.096-0.448 0.096-0.48 0-0.832-0.352t-0.32-0.8q0-0.64 0.704-1.056 0.128-0.064 0.384-0.192t0.416-0.192q0.8-0.448 1.44-0.896 2.208-1.632 3.456-4.064t1.216-5.152-1.216-5.152-3.456-4.064q-0.64-0.448-1.44-0.896-0.128-0.096-0.416-0.192t-0.384-0.192q-0.704-0.416-0.704-1.056 0-0.448 0.32-0.8t0.832-0.352q0.224 0 0.448 0.096 3.776 1.632 6.048 5.056t2.272 7.552z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 17 32"><path d="M14.080 4.8q2.88 0 2.88 2.048v18.24q0 2.112-2.88 2.112t-2.88-2.112v-18.24q0-2.048 2.88-2.048zM2.88 4.8q2.88 0 2.88 2.048v18.24q0 2.112-2.88 2.112t-2.88-2.112v-18.24q0-2.048 2.88-2.048z"></path></svg>';},function(e,t){e.exports='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 16 31"><path d="M15.552 15.168q0.448 0.32 0.448 0.832 0 0.448-0.448 0.768l-13.696 8.512q-0.768 0.512-1.312 0.192t-0.544-1.28v-16.448q0-0.96 0.544-1.28t1.312 0.192z"></path></svg>';},function(e,t,n){var i,a,r=e.exports={};function o(){throw new Error("setTimeout has not been defined")}function s(){throw new Error("clearTimeout has not been defined")}function l(e){if(i===setTimeout)return setTimeout(e,0);if((i===o||!i)&&setTimeout)return i=setTimeout,setTimeout(e,0);try{return i(e,0)}catch(t){try{return i.call(null,e,0)}catch(t){return i.call(this,e,0)}}}!function(){try{i="function"==typeof setTimeout?setTimeout:o;}catch(e){i=o;}try{a="function"==typeof clearTimeout?clearTimeout:s;}catch(e){a=s;}}();var u,c=[],p=!1,d=-1;function h(){p&&u&&(p=!1,u.length?c=u.concat(c):d=-1,c.length&&y());}function y(){if(!p){var e=l(h);p=!0;for(var t=c.length;t;){for(u=c,c=[];++d<t;)u&&u[d].run();d=-1,t=c.length;}u=null,p=!1,function(e){if(a===clearTimeout)return clearTimeout(e);if((a===s||!a)&&clearTimeout)return a=clearTimeout,clearTimeout(e);try{a(e);}catch(t){try{return a.call(null,e)}catch(t){return a.call(this,e)}}}(e);}}function f(e,t){this.fun=e,this.array=t;}function v(){}r.nextTick=function(e){var t=new Array(arguments.length-1);if(arguments.length>1)for(var n=1;n<arguments.length;n++)t[n-1]=arguments[n];c.push(new f(e,t)),1!==c.length||p||l(y);},f.prototype.run=function(){this.fun.apply(null,this.array);},r.title="browser",r.browser=!0,r.env={},r.argv=[],r.version="",r.versions={},r.on=v,r.addListener=v,r.once=v,r.off=v,r.removeListener=v,r.removeAllListeners=v,r.emit=v,r.prependListener=v,r.prependOnceListener=v,r.listeners=function(e){return []},r.binding=function(e){throw new Error("process.binding is not supported")},r.cwd=function(){return "/"},r.chdir=function(e){throw new Error("process.chdir is not supported")},r.umask=function(){return 0};},function(e,t,n){(function(e,t){!function(e,n){if(!e.setImmediate){var i,a,r,o,s,l=1,u={},c=!1,p=e.document,d=Object.getPrototypeOf&&Object.getPrototypeOf(e);d=d&&d.setTimeout?d:e,"[object process]"==={}.toString.call(e.process)?i=function(e){t.nextTick(function(){y(e);});}:!function(){if(e.postMessage&&!e.importScripts){var t=!0,n=e.onmessage;return e.onmessage=function(){t=!1;},e.postMessage("","*"),e.onmessage=n,t}}()?e.MessageChannel?((r=new MessageChannel).port1.onmessage=function(e){y(e.data);},i=function(e){r.port2.postMessage(e);}):p&&"onreadystatechange"in p.createElement("script")?(a=p.documentElement,i=function(e){var t=p.createElement("script");t.onreadystatechange=function(){y(e),t.onreadystatechange=null,a.removeChild(t),t=null;},a.appendChild(t);}):i=function(e){setTimeout(y,0,e);}:(o="setImmediate$"+Math.random()+"$",s=function(t){t.source===e&&"string"==typeof t.data&&0===t.data.indexOf(o)&&y(+t.data.slice(o.length));},e.addEventListener?e.addEventListener("message",s,!1):e.attachEvent("onmessage",s),i=function(t){e.postMessage(o+t,"*");}),d.setImmediate=function(e){"function"!=typeof e&&(e=new Function(""+e));for(var t=new Array(arguments.length-1),n=0;n<t.length;n++)t[n]=arguments[n+1];var a={callback:e,args:t};return u[l]=a,i(l),l++},d.clearImmediate=h;}function h(e){delete u[e];}function y(e){if(c)setTimeout(y,0,e);else{var t=u[e];if(t){c=!0;try{!function(e){var t=e.callback,i=e.args;switch(i.length){case 0:t();break;case 1:t(i[0]);break;case 2:t(i[0],i[1]);break;case 3:t(i[0],i[1],i[2]);break;default:t.apply(n,i);}}(t);}finally{h(e),c=!1;}}}}}("undefined"==typeof self?void 0===e?void 0:e:self);}).call(this,n(4),n(34));},function(e,t,n){var i=Function.prototype.apply;function a(e,t){this._id=e,this._clearFn=t;}t.setTimeout=function(){return new a(i.call(setTimeout,window,arguments),clearTimeout)},t.setInterval=function(){return new a(i.call(setInterval,window,arguments),clearInterval)},t.clearTimeout=t.clearInterval=function(e){e&&e.close();},a.prototype.unref=a.prototype.ref=function(){},a.prototype.close=function(){this._clearFn.call(window,this._id);},t.enroll=function(e,t){clearTimeout(e._idleTimeoutId),e._idleTimeout=t;},t.unenroll=function(e){clearTimeout(e._idleTimeoutId),e._idleTimeout=-1;},t._unrefActive=t.active=function(e){clearTimeout(e._idleTimeoutId);var t=e._idleTimeout;t>=0&&(e._idleTimeoutId=setTimeout(function(){e._onTimeout&&e._onTimeout();},t));},n(35),t.setImmediate=setImmediate,t.clearImmediate=clearImmediate;},function(e,t,n){(function(t){var n="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},i=setTimeout;function a(){}function r(e){if(!(this instanceof r))throw new TypeError("Promises must be constructed via new");if("function"!=typeof e)throw new TypeError("not a function");this._state=0,this._handled=!1,this._value=void 0,this._deferreds=[],c(e,this);}function o(e,t){for(;3===e._state;)e=e._value;0!==e._state?(e._handled=!0,r._immediateFn(function(){var n=1===e._state?t.onFulfilled:t.onRejected;if(null!==n){var i;try{i=n(e._value);}catch(e){return void l(t.promise,e)}s(t.promise,i);}else(1===e._state?s:l)(t.promise,e._value);})):e._deferreds.push(t);}function s(e,t){try{if(t===e)throw new TypeError("A promise cannot be resolved with itself.");if(t&&("object"===(void 0===t?"undefined":n(t))||"function"==typeof t)){var i=t.then;if(t instanceof r)return e._state=3,e._value=t,void u(e);if("function"==typeof i)return void c((a=i,o=t,function(){a.apply(o,arguments);}),e)}e._state=1,e._value=t,u(e);}catch(t){l(e,t);}var a,o;}function l(e,t){e._state=2,e._value=t,u(e);}function u(e){2===e._state&&0===e._deferreds.length&&r._immediateFn(function(){e._handled||r._unhandledRejectionFn(e._value);});for(var t=0,n=e._deferreds.length;t<n;t++)o(e,e._deferreds[t]);e._deferreds=null;}function c(e,t){var n=!1;try{e(function(e){n||(n=!0,s(t,e));},function(e){n||(n=!0,l(t,e));});}catch(e){if(n)return;n=!0,l(t,e);}}r.prototype.catch=function(e){return this.then(null,e)},r.prototype.then=function(e,t){var n=new this.constructor(a);return o(this,new function(e,t,n){this.onFulfilled="function"==typeof e?e:null,this.onRejected="function"==typeof t?t:null,this.promise=n;}(e,t,n)),n},r.prototype.finally=function(e){var t=this.constructor;return this.then(function(n){return t.resolve(e()).then(function(){return n})},function(n){return t.resolve(e()).then(function(){return t.reject(n)})})},r.all=function(e){return new r(function(t,i){if(!e||void 0===e.length)throw new TypeError("Promise.all accepts an array");var a=Array.prototype.slice.call(e);if(0===a.length)return t([]);var r=a.length;function o(e,s){try{if(s&&("object"===(void 0===s?"undefined":n(s))||"function"==typeof s)){var l=s.then;if("function"==typeof l)return void l.call(s,function(t){o(e,t);},i)}a[e]=s,0==--r&&t(a);}catch(e){i(e);}}for(var s=0;s<a.length;s++)o(s,a[s]);})},r.resolve=function(e){return e&&"object"===(void 0===e?"undefined":n(e))&&e.constructor===r?e:new r(function(t){t(e);})},r.reject=function(e){return new r(function(t,n){n(e);})},r.race=function(e){return new r(function(t,n){for(var i=0,a=e.length;i<a;i++)e[i].then(t,n);})},r._immediateFn="function"==typeof t&&function(e){t(e);}||function(e){i(e,0);},r._unhandledRejectionFn=function(e){"undefined"!=typeof console&&console&&console.warn("Possible Unhandled Promise Rejection:",e);},e.exports=r;}).call(this,n(36).setImmediate);},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var i=function(){function e(e,t){for(var n=0;n<t.length;n++){var i=t[n];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i);}}return function(t,n,i){return n&&e(t.prototype,n),i&&e(t,i),t}}(),a=v(n(37)),r=v(n(0)),o=v(n(3)),s=v(n(18)),l=v(n(17)),u=v(n(13)),c=v(n(12)),p=v(n(11)),d=v(n(9)),h=v(n(8)),y=v(n(7)),f=v(n(6));function v(e){return e&&e.__esModule?e:{default:e}}var m=[],g=function(){function e(t){if(function(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}(this,e),this.options=(0, s.default)(t),this.container=this.options.container,this.paused=!0,this.playedPromise=a.default.resolve(),this.mode="normal",this.randomOrder=r.default.randomOrder(this.options.audio.length),this.container.classList.add("aplayer"),this.options.lrcType&&!this.options.fixed&&this.container.classList.add("aplayer-withlrc"),this.options.audio.length>1&&this.container.classList.add("aplayer-withlist"),r.default.isMobile&&this.container.classList.add("aplayer-mobile"),this.arrow=this.container.offsetWidth<=300,this.arrow&&this.container.classList.add("aplayer-arrow"),this.container=this.options.container,2===this.options.lrcType||!0===this.options.lrcType)for(var n=this.container.getElementsByClassName("aplayer-lrc-content"),i=0;i<n.length;i++)this.options.audio[i]&&(this.options.audio[i].lrc=n[i].innerHTML);this.template=new l.default({container:this.container,options:this.options,randomOrder:this.randomOrder}),this.options.fixed&&(this.container.classList.add("aplayer-fixed"),this.template.body.style.width=this.template.body.offsetWidth-18+"px"),this.options.mini&&(this.setMode("mini"),this.template.info.style.display="block"),this.template.info.offsetWidth<200&&this.template.time.classList.add("aplayer-time-narrow"),this.options.lrcType&&(this.lrc=new p.default({container:this.template.lrc,async:3===this.options.lrcType,player:this})),this.events=new y.default,this.storage=new c.default(this),this.bar=new u.default(this.template),this.controller=new d.default(this),this.timer=new h.default(this),this.list=new f.default(this),this.initAudio(),this.bindEvents(),"random"===this.options.order?this.list.switch(this.randomOrder[0]):this.list.switch(0),this.options.autoplay&&this.play(),m.push(this);}return i(e,[{key:"initAudio",value:function(){var e=this;this.audio=document.createElement("audio"),this.audio.preload=this.options.preload;for(var t=function(t){e.audio.addEventListener(e.events.audioEvents[t],function(n){e.events.trigger(e.events.audioEvents[t],n);});},n=0;n<this.events.audioEvents.length;n++)t(n);this.volume(this.storage.get("volume"),!0);}},{key:"bindEvents",value:function(){var e=this;this.on("play",function(){e.paused&&e.setUIPlaying();}),this.on("pause",function(){e.paused||e.setUIPaused();}),this.on("timeupdate",function(){if(!e.disableTimeupdate){e.bar.set("played",e.audio.currentTime/e.duration,"width"),e.lrc&&e.lrc.update();var t=r.default.secondToTime(e.audio.currentTime);e.template.ptime.innerHTML!==t&&(e.template.ptime.innerHTML=t);}}),this.on("durationchange",function(){1!==e.duration&&(e.template.dtime.innerHTML=r.default.secondToTime(e.duration));}),this.on("progress",function(){var t=e.audio.buffered.length?e.audio.buffered.end(e.audio.buffered.length-1)/e.duration:0;e.bar.set("loaded",t,"width");});var t=void 0;this.on("error",function(){e.list.audios.length>1?(e.notice("An audio error has occurred, player will skip forward in 2 seconds."),t=setTimeout(function(){e.skipForward(),e.paused||e.play();},2e3)):1===e.list.audios.length&&e.notice("An audio error has occurred.");}),this.events.on("listswitch",function(){t&&clearTimeout(t);}),this.on("ended",function(){"none"===e.options.loop?"list"===e.options.order?e.list.index<e.list.audios.length-1?(e.list.switch((e.list.index+1)%e.list.audios.length),e.play()):(e.list.switch((e.list.index+1)%e.list.audios.length),e.pause()):"random"===e.options.order&&(e.randomOrder.indexOf(e.list.index)<e.randomOrder.length-1?(e.list.switch(e.nextIndex()),e.play()):(e.list.switch(e.nextIndex()),e.pause())):"one"===e.options.loop?(e.list.switch(e.list.index),e.play()):"all"===e.options.loop&&(e.skipForward(),e.play());});}},{key:"setAudio",value:function(e){this.hls&&(this.hls.destroy(),this.hls=null);var t=e.type;this.options.customAudioType&&this.options.customAudioType[t]?"[object Function]"===Object.prototype.toString.call(this.options.customAudioType[t])?this.options.customAudioType[t](this.audio,e,this):console.error("Illegal customType: "+t):(t&&"auto"!==t||(t=/m3u8(#|\?|$)/i.exec(e.url)?"hls":"normal"),"hls"===t?Hls.isSupported()?(this.hls=new Hls,this.hls.loadSource(e.url),this.hls.attachMedia(this.audio)):this.audio.canPlayType("application/x-mpegURL")||this.audio.canPlayType("application/vnd.apple.mpegURL")?this.audio.src=e.url:this.notice("Error: HLS is not supported."):"normal"===t&&(this.audio.src=e.url)),this.seek(0),this.paused||this.audio.play();}},{key:"theme",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:this.list.audios[this.list.index].theme||this.options.theme,t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:this.list.index;(!(arguments.length>2&&void 0!==arguments[2])||arguments[2])&&this.list.audios[t]&&(this.list.audios[t].theme=e),this.template.listCurs[t]&&(this.template.listCurs[t].style.backgroundColor=e),t===this.list.index&&(this.template.pic.style.backgroundColor=e,this.template.played.style.background=e,this.template.thumb.style.background=e,this.template.volume.style.background=e);}},{key:"seek",value:function(e){e=Math.max(e,0),e=Math.min(e,this.duration),this.audio.currentTime=e,this.bar.set("played",e/this.duration,"width"),this.template.ptime.innerHTML=r.default.secondToTime(e);}},{key:"setUIPlaying",value:function(){var e=this;if(this.paused&&(this.paused=!1,this.template.button.classList.remove("aplayer-play"),this.template.button.classList.add("aplayer-pause"),this.template.button.innerHTML="",setTimeout(function(){e.template.button.innerHTML=o.default.pause;},100),this.template.skipPlayButton.innerHTML=o.default.pause),this.timer.enable("loading"),this.options.mutex)for(var t=0;t<m.length;t++)this!==m[t]&&m[t].pause();}},{key:"play",value:function(){var e=this;this.setUIPlaying();var t=this.audio.play();t&&t.catch(function(t){console.warn(t),"NotAllowedError"===t.name&&e.setUIPaused();});}},{key:"setUIPaused",value:function(){var e=this;this.paused||(this.paused=!0,this.template.button.classList.remove("aplayer-pause"),this.template.button.classList.add("aplayer-play"),this.template.button.innerHTML="",setTimeout(function(){e.template.button.innerHTML=o.default.play;},100),this.template.skipPlayButton.innerHTML=o.default.play),this.container.classList.remove("aplayer-loading"),this.timer.disable("loading");}},{key:"pause",value:function(){this.setUIPaused(),this.audio.pause();}},{key:"switchVolumeIcon",value:function(){this.volume()>=.95?this.template.volumeButton.innerHTML=o.default.volumeUp:this.volume()>0?this.template.volumeButton.innerHTML=o.default.volumeDown:this.template.volumeButton.innerHTML=o.default.volumeOff;}},{key:"volume",value:function(e,t){return e=parseFloat(e),isNaN(e)||(e=Math.max(e,0),e=Math.min(e,1),this.bar.set("volume",e,"height"),t||this.storage.set("volume",e),this.audio.volume=e,this.audio.muted&&(this.audio.muted=!1),this.switchVolumeIcon()),this.audio.muted?0:this.audio.volume}},{key:"on",value:function(e,t){this.events.on(e,t);}},{key:"toggle",value:function(){this.template.button.classList.contains("aplayer-play")?this.play():this.template.button.classList.contains("aplayer-pause")&&this.pause();}},{key:"switchAudio",value:function(e){this.list.switch(e);}},{key:"addAudio",value:function(e){this.list.add(e);}},{key:"removeAudio",value:function(e){this.list.remove(e);}},{key:"destroy",value:function(){m.splice(m.indexOf(this),1),this.pause(),this.container.innerHTML="",this.audio.src="",this.timer.destroy(),this.events.trigger("destroy");}},{key:"setMode",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:"normal";this.mode=e,"mini"===e?this.container.classList.add("aplayer-narrow"):"normal"===e&&this.container.classList.remove("aplayer-narrow");}},{key:"notice",value:function(e){var t=this,n=arguments.length>1&&void 0!==arguments[1]?arguments[1]:2e3,i=arguments.length>2&&void 0!==arguments[2]?arguments[2]:.8;this.template.notice.innerHTML=e,this.template.notice.style.opacity=i,this.noticeTime&&clearTimeout(this.noticeTime),this.events.trigger("noticeshow",{text:e}),n&&(this.noticeTime=setTimeout(function(){t.template.notice.style.opacity=0,t.events.trigger("noticehide");},n));}},{key:"prevIndex",value:function(){if(!(this.list.audios.length>1))return 0;if("list"===this.options.order)return this.list.index-1<0?this.list.audios.length-1:this.list.index-1;if("random"===this.options.order){var e=this.randomOrder.indexOf(this.list.index);return 0===e?this.randomOrder[this.randomOrder.length-1]:this.randomOrder[e-1]}}},{key:"nextIndex",value:function(){if(!(this.list.audios.length>1))return 0;if("list"===this.options.order)return (this.list.index+1)%this.list.audios.length;if("random"===this.options.order){var e=this.randomOrder.indexOf(this.list.index);return e===this.randomOrder.length-1?this.randomOrder[0]:this.randomOrder[e+1]}}},{key:"skipBack",value:function(){this.list.switch(this.prevIndex());}},{key:"skipForward",value:function(){this.list.switch(this.nextIndex());}},{key:"duration",get:function(){return isNaN(this.audio.duration)?0:this.audio.duration}}],[{key:"version",get:function(){return "1.10.1"}}]),e}();t.default=g;},,function(e,t,n){},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0}),n(40);var i,a=n(38),r=(i=a)&&i.__esModule?i:{default:i};console.log("\n %c APlayer v1.10.1 af84efb %c http://aplayer.js.org \n","color: #fadfa3; background: #030307; padding:5px 0;","background: #fadfa3; padding:5px 0;"),t.default=r.default;}]).default});

    });

    var APlayer = unwrapExports(APlayer_min);
    var APlayer_min_1 = APlayer_min.APlayer;

    class Audios {
        constructor(scene, renderer, camera, onUpdateTempo, onUpdateAmplite, onDrapMusic) {
            this.scene = scene;
            this.renderer = renderer;
            this.camera = camera;
            this.onUpdateTempo = onUpdateTempo;
            this.onUpdateAmplite = onUpdateAmplite;
            this.onDrapMusic = onDrapMusic;
            this.bars = new Array();
            this.numberOfBars = 60;
            this.createBars();
            this.setupAudioProcessing();
            this.getAudio();
            this.handleDrop();

            const ap = new APlayer({
                container: document.getElementById('aplayer'),
                mini: false,
                autoplay: false,
                theme: '#FADFA3',
                loop: 'all',
                order: 'random',
                preload: 'none',
                volume: 0.7,
                mutex: true,
                listFolded: false,
                listMaxHeight: 90,
                lrcType: 3,
                audio: []
            });

            const musicList = [
                {
                    name: 'Faded',
                    artist: 'Alan Walker',
                    url: 'music/Alan Walker - Faded.mp3',
                    // cover: 'cover1.jpg',
                    // lrc: 'lrc1.lrc',
                    theme: '#ebd0c2'
                },
                {
                    name: 'Yellow',
                    artist: 'Coldplay',
                    url: 'music/Coldplay - Yellow.mp3',
                    // cover: 'cover2.jpg',
                    // lrc: 'lrc2.lrc',
                    theme: '#46718b'
                },
                {
                    name: 'Mondo Bongo',
                    artist: 'artist2',
                    url: 'music/mondo-bongo.mp3',
                    // cover: 'cover2.jpg',
                    // lrc: 'lrc2.lrc',
                    theme: '#46718b'
                }, 
                {
                    name: '普通Disco',
                    artist: '三无',
                    url:'music/三无MarBlue - 普通DISCO.mp3',
                    theme: '#46718b',
                }
            ];
            for (const music of musicList) {
                const request = new XMLHttpRequest();
                request.open('GET', music.url, true);
                request.responseType = 'blob';
                request.onload = () => {
                    const blob = request.response;
                    let arrayBuffer;
                    const fileReader = new FileReader();
                    fileReader.onload = (e) => {
                        arrayBuffer = e.target.result;
                        // analyze the arrayBuffer
                        this.audioContext.decodeAudioData(arrayBuffer, function (buffer) {
                            music.decodedBuffer = buffer;
                        });
                    };
                    fileReader.readAsArrayBuffer(blob);

                    // add to list
                    ap.list.add({
                        ...music,
                        url: URL.createObjectURL(blob)
                    });
                };
                request.send();
            }

            ap.on('play', async (e) => {
                // exit
                if (this.sourceBuffer) {
                    this.sourceBuffer.stop();
                    this.sourceBuffer.disconnect(this.analyser);
                    this.sourceBuffer.disconnect(this.audioContext.destination);
                }
                //create the source buffer
                this.sourceBuffer = this.audioContext.createBufferSource();
                this.sourceBuffer.connect(this.analyser);
                // 1.2 for playing
                this.sourceBuffer.connect(this.audioContext.destination);
                this.sourceBuffer.buffer = musicList[ap.list.index].decodedBuffer;
                this.sourceBuffer.start(0);

                // No 1 detector
                this.tempo = await analyze(this.sourceBuffer.buffer);
                console.log('music tempo', this.tempo);
                this.onUpdateTempo(this.tempo);
                this.onDrapMusic(ap.list.index);
                // console.log(e)
            });
        }

        //create the bars required to show the visualization
        createBars() {

            //iterate and create bars
            for (let i = 0; i < this.numberOfBars; i++) {

                //create a bar
                const barGeometry = new THREE.BoxGeometry(3, 3, 3);

                //create a material
                const material = new THREE.MeshPhongMaterial({
                    // color: this.getRandomColor(),
                    color: 0xF9F8ED,
                    flatShading: THREE.FlatShading,
                    // ambient: 0x808080,
                    specular: 0xffffff
                });

                //create the geometry and set the initial position
                this.bars[i] = new THREE.Mesh(barGeometry, material);

                //wyf: 这边希望改成所有的bar围绕成一个圆形（在地板平面上）
                this.bars[i].position.set(-100, 0, ((60 - i) - this.numberOfBars / 2) * 6);

                // Enable shadow.
                this.bars[i].castShadow = true;
                this.bars[i].receiveShadow = false;

                // bars[i].position.set(i - numberOfBars / 2, 0, 0);

                //add the created bar to the scene
                this.scene.add(this.bars[i]);
            }
        }

        setupAudioProcessing() {
            //get the audio context
            this.audioContext = new AudioContext();

            //create the javascript node
            this.javascriptNode = this.audioContext.createScriptProcessor(2048, 1, 1);

            //create the analyser node
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.smoothingTimeConstant = 0.3;
            this.analyser.fftSize = 512;

            // 1.1 for the bar chart
            this.analyser.connect(this.javascriptNode);
            this.javascriptNode.connect(this.audioContext.destination);
            //this is where we animates the bars
            this.javascriptNode.onaudioprocess = () => {

                // get the average for the first channel
                const array = new Uint8Array(this.analyser.frequencyBinCount);
                this.analyser.getByteFrequencyData(array);

                //render the scene and update controls
                this.renderer.render(this.scene, this.camera);
                // this.controls.update();

                const step = Math.round(array.length / this.numberOfBars);

                let averageAmpli = 0;
                //Iterate through the bars and scale the z axis
                for (var i = 0; i < this.numberOfBars; i++) {
                    var value = array[i * step] / 4;
                    value = Math.max(value, 1);
                    this.bars[i].scale.y = value;
                    averageAmpli += value;
                }
                averageAmpli /= this.numberOfBars;
                this.onUpdateAmplite(averageAmpli);
            };
        }

        //get the default audio from the server
        getAudio() {
            var request = new XMLHttpRequest();
            request.open("GET", "Asset/Aathi-StarMusiQ.Com.mp3", true);
            request.responseType = "arraybuffer";
            request.send();
            request.onload = () => {
                //that.start(request.response);
            };
        }

        //util method to get random colors to make stuff interesting
        getRandomColor() {
            var letters = '0123456789ABCDEF'.split('');
            var color = '#';
            for (var i = 0; i < 6; i++) {
                color += letters[Math.floor(Math.random() * 16)];
            }
            return color;
        }

        //1. start the audio processing
        start(buffer) {
            this.audioContext.decodeAudioData(buffer,
                async (decodedBuffer) => {
                    // exit
                    if (this.sourceBuffer) {
                        this.sourceBuffer.stop();
                        this.sourceBuffer.disconnect(this.analyser);
                        this.sourceBuffer.disconnect(this.audioContext.destination);
                    }
                    //create the source buffer
                    this.sourceBuffer = this.audioContext.createMediaElementSource(ap.audio);

                    this.sourceBuffer.connect(this.analyser);
                    // 1.2 for playing
                    this.sourceBuffer.connect(this.audioContext.destination);
                    this.sourceBuffer.buffer = decodedBuffer;
                    this.sourceBuffer.start(0);

                    // No 1 detector
                    this.tempo = await analyze(decodedBuffer);
                    console.log('music tempo', this.tempo);
                    this.onUpdateTempo(this.tempo);
                    this.onDrapMusic();
                    // .then(tempo => console.log(`No.1 detector ${tempo}`))

                    // No2 detcector
                    // const audioData = [];
                    // // Take the average of the two channels
                    // if (decodedBuffer.numberOfChannels == 2) {
                    //     var channel1Data = decodedBuffer.getChannelData(0);
                    //     var channel2Data = decodedBuffer.getChannelData(1);
                    //     var length = channel1Data.length;
                    //     for (var i = 0; i < length; i++) {
                    //         audioData[i] = (channel1Data[i] + channel2Data[i]) / 2;
                    //     }
                    // } else {
                    //     audioData = decodedBuffer.getChannelData(0);
                    // }
                    // var mt = new MusicTempo(audioData);

                    // console.log(`No.2 detector ${mt.tempo}`);
                    // console.log(`No.2 detector ${mt.beats}`);
                },
                (err) => console.error(err));
        }

        handleDrop() {
            //drag Enter
            document.body.addEventListener("dragenter", function () {

            }, false);

            //drag over
            document.body.addEventListener("dragover", function (e) {
                e.stopPropagation();
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }, false);

            //drag leave
            document.body.addEventListener("dragleave", function () {

            }, false);

            //drop
            document.body.addEventListener("drop", (e) => {
                e.stopPropagation();

                e.preventDefault();

                //get the file
                var file = e.dataTransfer.files[0];
                var fileName = file.name;

                $("#guide").text("Playing " + fileName);

                const fileReader = new FileReader();

                fileReader.onload = (e) => {
                    const fileResult = e.target.result;
                    this.start(fileResult);
                };

                fileReader.onerror = (e) => {
                    debugger
                };

                fileReader.readAsArrayBuffer(file);
            }, false);
        }
    }

    let actions = [];
    let action = [];
    let mixers = [];
    let doneMixer = 0;
    let meshHelpers = [];
    let renderer, camera, scene, gui, light, stats, controls;
    var clock = new THREE.Clock();
    let musicTempo = 1;
    let currentMusic = 0;

    window.onload = () => {
        //兼容性判断
        if (!Detector.webgl) Detector.addGetWebGLMessage();

        initGui();
        initRender();
        initScene();
        initCamera();
        initLight();

        // audio things
        const audios = new Audios(scene, renderer, camera, (tempo) => {
            // action.setEffectiveTimeScale(tempo * 0.01)
            musicTempo = tempo;
        }, (amplit) => {
            if (action) {
                action.forEach(a => {
                    if (currentMusic === 3) {
                        a.setEffectiveTimeScale(musicTempo / a._tempo * Math.min(1.25, Math.max(0.25, amplit / 20)));
                    } else if (currentMusic !== 2) {
                        a.setEffectiveTimeScale(musicTempo / a._tempo * Math.min(1, Math.max(0.25, amplit / 30)));
                    }
                });

            }
        }, (currentMusicIndex) => {
            const preAction = action;
            currentMusic = currentMusicIndex;

            // e.action.stop()
            while (action === preAction) {
                if (currentMusic === 2) {// samba
                    action = actions[(actions.length - 5) + Math.round(Math.random() * 4)];
                } else {
                    action = actions[Math.round(Math.random() * (actions.length - 5))];
                }
            }

            action.forEach((a, i) => {
                a.reset();
                a.play();
                a.setEffectiveTimeScale(musicTempo / a._tempo);
                a.setEffectiveWeight(1);
                if (preAction[i]) {
                    a.crossFadeFrom(preAction[i], 1, true);
                }
            });

        });
        initModel();

        initControls();
        initStats();
        animate();

        window.onresize = onWindowResize;
    };

    function initRender() {
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0xeeeeee);
        renderer.shadowMap.enabled = true;
        //告诉渲染器需要阴影效果
        document.body.appendChild(renderer.domElement);
    }

    function initCamera() {
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
        camera.position.set(500, 400, 600);
    }

    function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xa0a0a0);
        scene.fog = new THREE.Fog(0xa0a0a0, 500, 1500);
    }

    //初始化dat.GUI简化试验流程
    function initGui() {
        //声明一个保存需求修改的相关数据的对象
        gui = {
            animation: true,
            helper: true //模型辅助线
        };
        var datGui = new dat.GUI();
        //将设置属性添加到gui当中，gui.add(对象，属性，最小值，最大值）
        datGui.add(gui, "animation").onChange(function (e) {
            if (e) {
                action.forEach(a => {
                    a.play();
                });
            } else {
                action.forEach(a => {
                    a.stop();
                });
            }
        });

        datGui.add(gui, "helper").onChange(function (e) {
            meshHelpers.forEach(meshHelper => {
                meshHelper.visible = e;
            });
        });
    }

    function initLight() {
        scene.add(new THREE.AmbientLight(0x444444));
        light = new THREE.DirectionalLight(0xffffff);
        light.position.set(0, 400, 200);

        light.castShadow = true;
        light.shadow.camera.top = 180;
        light.shadow.camera.bottom = -100;
        light.shadow.camera.left = -120;
        light.shadow.camera.right = 120;

        //告诉平行光需要开启阴影投射
        light.castShadow = true;
        scene.add(light);

    }

    function cloneFbx(fbx) {
        const clone = fbx.clone(true);
        clone.animations = [...fbx.animations];
        // console.log(fbx.skeleton.getBoneByName)
        // clone.skeleton = { bones: [] }

        const skinnedMeshes = {};
        fbx.traverse(node => {
            if (node.isSkinnedMesh) {
                skinnedMeshes[node.name] = node;
            }
        });

        const cloneBones = {};
        const cloneSkinnedMeshes = {};
        clone.traverse(node => {
            if (node.isBone) {
                cloneBones[node.name] = node;
            }

            if (node.isSkinnedMesh) {
                cloneSkinnedMeshes[node.name] = node;
            }
        });

        for (let name in skinnedMeshes) {
            const skinnedMesh = skinnedMeshes[name];
            const skeleton = skinnedMesh.skeleton;
            const cloneSkinnedMesh = cloneSkinnedMeshes[name];

            const orderedCloneBones = [];
            for (let i = 0; i < skeleton.bones.length; i++) {
                const cloneBone = cloneBones[skeleton.bones[i].name];
                orderedCloneBones.push(cloneBone);
            }

            cloneSkinnedMesh.bind(
                new THREE.Skeleton(orderedCloneBones, skeleton.boneInverses),
                cloneSkinnedMesh.matrixWorld);

            // For animation to work correctly:
            // clone.skeleton.bones.push(cloneSkinnedMesh)
            // clone.skeleton.bones.push(...orderedCloneBones)
        }

        return clone
    }

    async function initModel() {
        //辅助工具
        const helper = new THREE.AxesHelper(50);
        scene.add(helper);

        // 地板
        const floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(2000, 2000), new THREE.MeshPhongMaterial({ color: 0xffffff, depthWrite: false }));
        floor.rotation.x = - Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        //添加地板割线
        const grid = new THREE.GridHelper(2000, 20, 0x000000, 0x000000);
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        scene.add(grid);

        //加载模型
        // [206.4, 258.3, 264.2, 290.9] 
        //  [103.04, 129.2, 132, 145.5]// 
        const actionTempos = [113.7, 105.6, 90.2, 93.9, 101.4, 142.5, 103.04, 129.2, 132, 145.5, 105.5];
        await Promise.all(actionTempos
            .map(index => new Promise((resolve, reject) => {
                const loader = new THREE.FBXLoader();
                loader.load(`model/fbx/${index}.fbx`, mesh => resolve(mesh), () => { }, err => reject(err));
            })))
            .then(meshes => {
                // 1 first mesh
                const mesh = meshes.shift();
                mesh.animations = [mesh.animations[0], ...meshes.map(m => m.animations[0])];
                console.log("mesh:\n", mesh);
                //添加骨骼辅助
                const meshHelper = new THREE.SkeletonHelper(mesh);
                meshHelpers.push(meshHelper);
                scene.add(meshHelper);

                //设置模型的每个部位都可以投影
                mesh.traverse(function (child) {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                scene.add(mesh);

                //AnimationMixer是场景中特定对象的动画播放器。当场景中的多个对象独立动画时，可以为每个对象使用一个AnimationMixer
                mesh.mixer = new THREE.AnimationMixer(mesh);
                mixers.push(mesh.mixer);
                actions = mesh.animations.map((a, i) => {
                    const action = mesh.mixer.clipAction(a);
                    action._tempo = actionTempos[i];
                    return [action]
                });
                action = actions[0];

                for(let i = 0; i < 5; ++i) {
                    const cloneMesh = cloneFbx(mesh);
                    cloneMesh.position.set(70 * (i+1), 0, i % 2 ? 0 : 150);
                    scene.add(cloneMesh);
        
                    //添加骨骼辅助
                    const meshHelper = new THREE.SkeletonHelper(cloneMesh);
                    scene.add(meshHelper);
                    meshHelpers.push(meshHelper);
                    // mixer
                    cloneMesh.mixer = new THREE.AnimationMixer(cloneMesh);
                    mixers.push(cloneMesh.mixer);
        
                    cloneMesh.animations.forEach((a, i) => {
                        const action = cloneMesh.mixer.clipAction(a);
                        action._tempo = actionTempos[i];
                        actions[i].push(action);
                    });
                }

                // for chain
                mixers.forEach(mixer => {
                    mesh.mixer.addEventListener('loop', e => {
                        doneMixer += 1;
                        if(doneMixer === mixers.length) {
                            doneMixer = 0;
                            // stop all action
                            const preAction = action;
                            // preAction.forEach(a => a.stop())

                            // random pick
                            while (action === preAction) {
                                if (currentMusic === 2) {// samba
                                    action = actions[(actions.length - 5) + Math.round(Math.random() * 4)];
                                } else {
                                    action = actions[Math.round(Math.random() * (actions.length - 5))];
                                }
                            }
        
                            action.forEach((a, i) => {
                                a.reset();
                                a.play();
                                a.setEffectiveTimeScale(musicTempo / a._tempo);
                                a.setEffectiveWeight(1);
                                a.crossFadeFrom(preAction[i], 1, true);
                            });
                        }
                    }); // properties of e: type, action and direction
                });
            });
    }

    //初始化性能插件
    function initStats() {

        stats = new Stats();
        document.body.appendChild(stats.dom);

    }

    function initControls() {
        controls = new THREE.OrbitControls(camera, renderer.domElement);

        //设置控制器的中心点
        // controls.target.set( 0, 100, 0 );
        controls.target = new THREE.Vector3(0, 100, 0);//控制焦点

        // 如果使用animate方法时，将此函数删除
        //controls.addEventListener( 'change', render );
        // 使动画循环使用时阻尼或自转 意思是否有惯性
        controls.enableDamping = true;

        //动态阻尼系数 就是鼠标拖拽旋转灵敏度
        //controls.dampingFactor = 0.25;

        //是否可以缩放
        controls.enableZoom = true;

        //是否自动旋转
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;

        //设置相机距离原点的最远距离
        controls.minDistance = 1;

        //设置相机距离原点的最远距离
        controls.maxDistance = 2000;

        //是否开启右键拖拽
        controls.enablePan = true;
    }

    function render$1() {
        var time = clock.getDelta();
        mixers.forEach(mixer => {
            if (mixer) {
                mixer.update(time);
            }
        });

        controls.update();
    }

    //窗口变动触发的函数

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        //更新控制器
        render$1();

        //更新性能插件
        stats.update();
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }

}());
