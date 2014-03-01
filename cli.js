module.exports = cli;

function cli(bot, log) {
    var fs = require('fs');
    var cluster = require('cluster');
    var client = require('./client');
    var argv = require('optimist').argv;

    if (!log) log = cli.defaultLog;

    // A config is required.
    if (argv._.length !== 1) usage();
    var cfgFile = argv._[0];

    // A mode must be specified.
    var mode, numTurns, mapName;
    if ((argv.a === undefined) === (argv.t === undefined))
        usage('Must specify either -a or -t.');
    if (argv.a) {
        mode = 'arena';
    }
    else {
        mode = 'training';
        numTurns = argv.turns;
        mapName = argv.map;
    }

    // The number of games can be specified as a number or 'INF' to continue
    // indefinitely. The games can be processed in parallel using
    // '<workers>,<games>' notation. When processing in parallel, a limit can
    // be set on the number of workers waiting in the queue for a new game
    // using '<limit>,<workers>,<games>' notation. Finally, queuing can be
    // attempted in groups with '<group>,<limit>,<workers>,<games>', for
    // teaming up. (But there's no guarantee they'll end up in the same game.)
    var numGames, numWorkers, queueSize, groupSize;
    numGames = argv.a || argv.t;
    numWorkers = queueSize = groupSize = 1;

    if (numGames === 'INF') {
        numGames = Infinity;
    }
    else if (typeof(numGames) === 'string') {
        var parts = numGames.split(',', 4);
        if (parts.length === 2) {
            numWorkers = parseInt(parts[0], 10);
            numGames = parts[1];
            queueSize = numWorkers;
        }
        else if (parts.length === 3) {
            queueSize = parseInt(parts[0], 10);
            numWorkers = parseInt(parts[1], 10);
            numGames = parts[2];
        }
        else {
            groupSize = parseInt(parts[0], 10);
            queueSize = parseInt(parts[1], 10);
            numWorkers = parseInt(parts[2], 10);
            numGames = parts[3];
        }

        if (numGames === 'INF')
            numGames = Infinity;
        else
            numGames = parseInt(numGames, 10);
    }

    if (!numGames || numGames < 1)
        usage('Invalid number of games.');
    if (!numWorkers || numWorkers < 1)
        usage('Invalid number of workers.');
    if (!queueSize || queueSize < 1)
        usage('Invalid queue size.');
    if (!groupSize || groupSize < 1)
        usage('Invalid group size.');

    if (queueSize > numWorkers)
        usage('Queue size cannot be larger than number of workers.');
    if (groupSize > queueSize)
        usage('Group size cannot be large than queue size.');
    if (numGames !== Infinity && numGames % groupSize !== 0)
        usage('Number of games must be multiple of group size.');

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
    else if (numWorkers === 1) {
        readConfig(singleProcessLoop);

        process.on('SIGINT', function() {
            numGames = 0;

            if (abortOnInterrupt) {
                log('abort');
                process.exit(1);
            }
            else {
                log('graceful');
                abortOnInterrupt = true;
            }
        });
    }

    // We are the master. Create workers as needed.
    else {
        readConfig(masterLoop);

        process.on('SIGINT', function() {
            numGames = 0;

            if (abortOnInterrupt) {
                log('abort');
            }
            else {
                log('graceful');
                abortOnInterrupt = true;
            }
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
        while (numGames >= groupSize &&
                numWorkers >= groupSize &&
                queueSize >= groupSize) {
            for (var i = 0; i < groupSize; i++) {
                var worker = cluster.fork();
                worker.on('exit', onExit);
                worker.on('message', onMessage);

                numGames--;
                numWorkers--;
                queueSize--;
            }
        }

        function onExit() {
            numWorkers++;
            masterLoop(config);
        }

        function onMessage(msg) {
            if (msg.type === 'dequeue') {
                queueSize++;
                masterLoop(config);
            }
        }
    }

    // Callback loop for when we're doing serial processing.
    function singleProcessLoop(config) {
        client(config, function(err, state) {
            if (--numGames > 0) singleProcessLoop(config);
        });
    }
}

// Default log callback.
cli.defaultLog = function(ev, arg) {
    if (ev === 'turn') {
        process.stdout.write('.');
    }
    else if (ev === 'queue') {
        console.log('QUEUE - Waiting for players...');
    }
    else if (ev === 'start') {
        console.log('START - ' + arg.viewUrl);
    }
    else if (ev === 'end') {
        process.stdout.write('\n');
        console.log(cli.ranking(arg));
        console.log('Replay: ' + arg.viewUrl);
    }
    else if (ev === 'graceful') {
        console.log('\nSIGINT: Finishing matches. Press again to abort.');
    }
    else if (ev === 'abort') {
        console.log('\nSIGINT: Matches aborted.');
    }
    else if (ev === 'error') {
        console.error(arg.stack || arg.message || arg);
    }
};

// Build simple end-game ranking string.
cli.ranking = function(state) {
    var str;
    var topScore = -1;
    var topRankers = 0;

    var ranking = state.game.heroes.slice();
    ranking.sort(function(a, b) {
        return b.gold - a.gold;
    });

    if (state.hero.gold === ranking[0].gold) {
        if (ranking[0].gold === ranking[1].gold)
            str = 'DRAW';
        else
            str = 'WIN';
    }
    else {
        str = 'LOSS';
    }

    return str + ' - ' + ranking.map(function(hero) {
        return 'P' + hero.id + ' ' + hero.name + ': ' + hero.gold + ' ◯';
    }).join(', ');
};

// CLI output helpers.
function usage(msg) {
    var path = require('path');

    var script = path.basename(process.argv[1]);
    console.error("Usage: %s <-a|-t> <num games> <config>", script);
    if (msg) console.error(msg);

    process.exit(1);
}

function fatal(pre, err) {
    console.error(pre + ': ' + err.message);
    process.exit(2);
}
