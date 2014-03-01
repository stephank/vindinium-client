var client = require('./client');

function cli(bot, log) {
    var fs = require('fs');
    var cluster = require('cluster');

    var mode, numGames, numChildren, numQueue;
    var numTurns, mapName, cfgFile;
    var argv = require('optimist').argv;

    if (!log) log = defaultLog;

    // A config is required.
    if (argv._.length !== 1) usage();
    cfgFile = argv._[0];

    // A mode must be specified.
    if ((argv.a === undefined) === (argv.t === undefined)) usage();
    if (argv.a) {
        mode = 'arena';
        numGames = argv.a;
    }
    else {
        mode = 'training';
        numGames = argv.t;
        numTurns = argv.turns;
        mapName = argv.map;
    }

    // The number of games can be specified as a number or 'INF' to continue
    // indefinitely. The games can be processed in parallel using
    // '<workers>,<games>' notation. When processing in parallel, a limit can
    // be set on the number of workers waiting in the queue for a new game
    // using '<limit>,<workers>,<games>' notation.
    if (numGames === 'INF')
        numGames = Infinity;

    if (typeof(numGames) === 'string') {
        var parts = numGames.split(',', 3);
        if (parts.length === 2) {
            numChildren = parseInt(parts[0], 10);
            numGames = parts[1];
            numQueue = numChildren;
        }
        else {
            numQueue = parseInt(parts[0], 10);
            numChildren = parseInt(parts[1], 10);
            numGames = parts[2];
        }

        if (numGames === 'INF')
            numGames = Infinity;
        else
            numGames = parseInt(numGames, 10);
    }
    else {
        numChildren = 1;
        numQueue = numChildren;
    }

    if (!numGames || numGames < 1) usage();
    if (!numChildren || numChildren < 1) usage();
    if (!numQueue || numQueue < 1 || numQueue > numChildren) usage();

    var gameNo = 0;

    // On the first interrupt during an arena match, we finish running games
    // gracefully. If the user interrupts again, we abort. Training matches are
    // immediatly aborted.
    var abortOnInterrupt = (mode === 'training');

    // Workers execute a single game, then exit. A dequeue message is sent to
    // the master to signal that worker was dequeued on the server and the game
    // has started.
    if (cluster.isWorker) {
        readConfig(function(config) {
            config.signalMaster = true;
            client(config, function(err, state) {
                if (err) console.error(err.stack || err.message || err);
                cluster.worker.disconnect();
            });
        });

        process.on('SIGINT', function() {
            if (abortOnInterrupt) process.exit(1);

            abortOnInterrupt = true;
        });
    }

    // If no parallel processing is requested, don't use cluster at all. This
    // makes debugging and profiling easier.
    else if (numChildren === 1) {
        readConfig(singleProcessLoop);

        process.on('SIGINT', function() {
            if (abortOnInterrupt) process.exit(1);

            abortOnInterrupt = true;
            numGames = 0;
            warnGraceful();
        });
    }

    // We are the master. Create workers as needed.
    else {
        readConfig(masterLoop);

        process.on('SIGINT', function() {
            if (abortOnInterrupt) return;

            abortOnInterrupt = true;
            numGames = 0;
            warnGraceful();
        });
    }

    // Common config reading code.
    function readConfig(cb) {
        fs.readFile(cfgFile, 'utf8', function(err, config) {
            if (err) fatal('Failed to open config', err);

            try { config = JSON.parse(config); }
            catch (e) { fatal('Failed to parse config', e); }

            config.bot = bot;
            config.mode = mode;
            config.log = log;
            if (mode === 'training') {
                config.turns = numTurns;
                config.map = mapName;
            }

            cb(config);
        });
    }

    // Repeatedly called on the master when counter change.
    // Make sure as many processes are running as requested.
    function masterLoop(config) {
        while (numGames && numChildren && numQueue) {
            var worker = cluster.fork();
            worker.on('exit', onExit);
            worker.on('message', onMessage);

            numGames--;
            numChildren--;
            numQueue--;
        }

        function onExit() {
            numChildren++;
            masterLoop(config);
        }

        function onMessage(msg) {
            if (msg.type === 'dequeue') {
                numQueue++;
                masterLoop(config);
            }
        }
    }

    // Callback loop for when we're doing serial processing.
    function singleProcessLoop(config) {
        client(config, function(err, state) {
            if (err) console.error(err.stack || err.message || err);
            if (--numGames > 0) singleProcessLoop(config);
        });
    }
}

// Default log callback.
function defaultLog(state) {
    process.stdout.write('.');
    if (state.game.finished) {
        process.stdout.write('\n');
        console.log('Finished %s/%s: %s', i + 1, numGames, state.viewUrl);
    }
}

// CLI output helpers.
function usage() {
    console.error('Usage: %s [-a|-t] <numGames> <config>', process.argv[1]);
    process.exit(1);
}

function fatal(pre, err) {
    console.error(pre + ': ' + err.message);
    process.exit(2);
}

function warnGraceful() {
    console.log('### SIGINT: Finishing matches. Press again to abort.');
}

// Export the CLI.
module.exports = cli;
