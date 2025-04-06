// Import role modules
var roleHarvester = require('harvester');
var roleUpgrader = require('upgrader');
var roleBuilder = require('builder');
var roleHauler = require('hauler');

module.exports.loop = function () {
    /**
 * Movement coordination module - add this to your codebase
 * This helps with creep movement coordination and preventing traffic jams
 * 
 * Usage: In main.js, add 'var moveCoordinator = require('moveCoordinator');'
 * And add 'moveCoordinator.init();' at the start of your main loop
 */

var moveCoordinator = {
    /**
     * Initialize the movement coordinator
     * Call this at the beginning of each tick
     */
    init: function() {
        if(!Memory.moveCoordinator) {
            Memory.moveCoordinator = {
                positions: {},
                intentions: {}
            };
        } else {
            // Clear the previous tick's data
            Memory.moveCoordinator.positions = {};
            Memory.moveCoordinator.intentions = {};
        }
        
        // Register all creep positions
        for(const name in Game.creeps) {
            const creep = Game.creeps[name];
            const posKey = this.positionToKey(creep.pos);
            Memory.moveCoordinator.positions[posKey] = name;
        }
    },
    
    /**
     * Convert a position to a unique string key
     */
    positionToKey: function(pos) {
        return `${pos.roomName}_${pos.x}_${pos.y}`;
    },
    
    /**
     * Improved moveTo that avoids traffic jams
     * @param {Creep} creep - The creep to move
     * @param {RoomPosition|{pos: RoomPosition}} target - The target to move to
     * @param {Object} opts - Options for moveTo
     * @returns {number} Result code
     */
    moveTo: function(creep, target, opts = {}) {
        // Extract target position
        const targetPos = target.pos ? target.pos : target;
        
        // If already at target, no need to move
        if(creep.pos.isEqualTo(targetPos)) {
            return OK;
        }
        
        // If next to target, also don't need complex logic
        if(creep.pos.isNearTo(targetPos)) {
            return creep.moveTo(target, opts);
        }
        
        // Default options
        const defaultOpts = {
            reusePath: 5,
            visualizePathStyle: {stroke: '#ffffff'},
            ignoreCreeps: false, // Important: don't ignore creeps for initial pathing
            plainCost: 2,
            swampCost: 10 // Prefer roads over swamps
        };
        
        // Merge with provided options
        const options = {...defaultOpts, ...opts};
        
        // Get the previous path from memory
        const prevPath = creep.memory._move?.path;
        const prevTarget = creep.memory._move?.dest;
        
        // Check if we already have a valid path to the same destination
        if(prevPath && prevTarget && 
           prevTarget.roomName === targetPos.roomName &&
           prevTarget.x === targetPos.x && 
           prevTarget.y === targetPos.y) {
            
            // Get next position in path
            const pathPos = this.getNextPathPosition(creep, prevPath);
            if(pathPos) {
                const posKey = this.positionToKey(pathPos);
                
                // Check if the next position is occupied
                if(Memory.moveCoordinator.positions[posKey]) {
                    const blockingCreepName = Memory.moveCoordinator.positions[posKey];
                    const blockingCreep = Game.creeps[blockingCreepName];
                    
                    if(blockingCreep) {
                        // Check if the blocking creep is trying to move to our position (swap)
                        if(blockingCreep.memory._move?.path) {
                            const blockingNextPos = this.getNextPathPosition(blockingCreep, blockingCreep.memory._move.path);
                            
                            if(blockingNextPos && blockingNextPos.isEqualTo(creep.pos)) {
                                // The creeps are trying to swap! Allow it
                                return creep.move(creep.pos.getDirectionTo(pathPos));
                            }
                        }
                        
                        // Check if the blocking creep has been there for multiple ticks
                        if(blockingCreep.memory.stuckAt === posKey) {
                            blockingCreep.memory.stuckTicks = (blockingCreep.memory.stuckTicks || 0) + 1;
                            
                            // If stuck for too long, try to find an alternative path
                            if(blockingCreep.memory.stuckTicks > 3) {
                                // Reset path to force recalculation with ignoreCreeps
                                delete creep.memory._move;
                                options.ignoreCreeps = true;
                            }
                        } else {
                            blockingCreep.memory.stuckAt = posKey;
                            blockingCreep.memory.stuckTicks = 1;
                        }
                    }
                }
            }
        }
        
        // Register our intention to move to the next position
        const result = creep.moveTo(target, options);
        
        // If we're stuck, try to step aside for other creeps
        if(result !== OK && result !== ERR_TIRED) {
            creep.memory.stuck = (creep.memory.stuck || 0) + 1;
            
            // After being stuck for a few ticks, try to move randomly
            if(creep.memory.stuck > 5) {
                const directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
                // Shuffle directions
                directions.sort(() => 0.5 - Math.random());
                
                // Try each direction until we find one that works
                for(let i = 0; i < directions.length; i++) {
                    const direction = directions[i];
                    const newPos = new RoomPosition(
                        creep.pos.x + Game.dirs[direction][0],
                        creep.pos.y + Game.dirs[direction][1],
                        creep.pos.roomName
                    );
                    
                    // Skip if out of bounds
                    if(newPos.x < 0 || newPos.y < 0 || newPos.x > 49 || newPos.y > 49) continue;
                    
                    // Check if position is walkable and not occupied
                    const posKey = this.positionToKey(newPos);
                    const terrain = Game.map.getRoomTerrain(newPos.roomName);
                    
                    if(terrain.get(newPos.x, newPos.y) !== TERRAIN_MASK_WALL && 
                       !Memory.moveCoordinator.positions[posKey]) {
                        creep.move(direction);
                        creep.memory.stuck = 0;
                        break;
                    }
                }
            }
        } else {
            // Reset stuck counter when we can move
            creep.memory.stuck = 0;
        }
        
        return result;
    },
    
    /**
     * Get the next position in a serialized path
     */
    getNextPathPosition: function(creep, serializedPath) {
        if(!serializedPath || serializedPath.length === 0) return null;
        
        // PathFinder returns path as a serialized string of encoded directions
        const nextDirection = parseInt(serializedPath[0]);
        if(isNaN(nextDirection)) return null;
        
        // Calculate new position based on direction
        let newX = creep.pos.x;
        let newY = creep.pos.y;
        
        // See https://docs.screeps.com/api/#Room-serializePath
        if(nextDirection === TOP || nextDirection === TOP_RIGHT || nextDirection === TOP_LEFT) {
            newY--;
        } else if(nextDirection === BOTTOM || nextDirection === BOTTOM_RIGHT || nextDirection === BOTTOM_LEFT) {
            newY++;
        }
        
        if(nextDirection === RIGHT || nextDirection === TOP_RIGHT || nextDirection === BOTTOM_RIGHT) {
            newX++;
        } else if(nextDirection === LEFT || nextDirection === TOP_LEFT || nextDirection === BOTTOM_LEFT) {
            newX--;
        }
        
        // Return new position
        return new RoomPosition(newX, newY, creep.pos.roomName);
    }
};

module.exports = moveCoordinator;
    
    if (!Memory.lastTickTime) {
        Memory.lastTickTime = Date.now();
        Memory.lastTick = Game.time;
    } else {
        // Calculate real-world time between ticks
        const realTimePassed = Date.now() - Memory.lastTickTime;
        const ticksPassed = Game.time - Memory.lastTick;
        
        // If more than 5 seconds passed but only 1 tick, log it
        if (realTimePassed > 5000 && ticksPassed == 1) {
            console.log(`ALERT: ${realTimePassed}ms passed for 1 tick - POSSIBLE SERVER PAUSE`);
        }
        
        Memory.lastTickTime = Date.now();
        Memory.lastTick = Game.time;
    }
    
    // CPU Diagnostics
    const startCpu = Game.cpu.getUsed();
    console.log(`Tick ${Game.time} starting. CPU: ${startCpu.toFixed(2)}/${Game.cpu.limit}, Bucket: ${Game.cpu.bucket}`);
    
    // Track timing of different sections
    let cpuTracker = {
        memoryCleanup: 0,
        creepCounting: 0,
        populationCalc: 0,
        spawning: 0,
        creepControl: 0
    };
    
    try {
        // Memory cleanup - track CPU
        const memoryStartCpu = Game.cpu.getUsed();
        for(var name in Memory.creeps) {
            if(!Game.creeps[name]) {
                delete Memory.creeps[name];
                console.log('Clearing non-existing creep memory:', name);
            }
        }
        cpuTracker.memoryCleanup = Game.cpu.getUsed() - memoryStartCpu;

        // Count creeps by role - track CPU
        const countStartCpu = Game.cpu.getUsed();
        var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
        var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
        var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
        var haulers = _.filter(Game.creeps, (creep) => creep.memory.role == 'hauler');
        cpuTracker.creepCounting = Game.cpu.getUsed() - countStartCpu;

        // Population calculation - track CPU
        const popCalcStartCpu = Game.cpu.getUsed();
        
        // Define minimum populations based on colony stage
        var sources = Game.spawns['Spawn1'].room.find(FIND_SOURCES);
        // For each source, allocate optimal number of harvesters based on open spaces
        var minHarvesters = 0;
        for(var i = 0; i < sources.length; i++) {
            var source = sources[i];
            // Count free spaces around this source
            var terrain = Game.map.getRoomTerrain(source.room.name);
            var freeSpaces = 0;
            
            for(var dx = -1; dx <= 1; dx++) {
                for(var dy = -1; dy <= 1; dy++) {
                    // Skip the source itself
                    if(dx == 0 && dy == 0) continue;
                    
                    var x = source.pos.x + dx;
                    var y = source.pos.y + dy;
                    
                    // Make sure position is inside room bounds
                    if(x < 1 || x > 48 || y < 1 || y > 48) continue;
                    
                    // Count non-wall spaces
                    if(terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                        freeSpaces++;
                    }
                }
            }
            
            // Add harvesters for this source (minimum 1, maximum based on free spaces)
            minHarvesters += Math.min(2, Math.max(1, freeSpaces));
        }
        
        // Set hauler count based on harvester count
        var minHaulers = Math.max(2, Math.ceil(minHarvesters * 1.5)); // 1.5 haulers per harvester, minimum 2
        var minUpgraders = 1;
        var minBuilders = 1;

        // Adjust builder count based on construction sites
        var constructionSites = _.size(Game.constructionSites);
        if(constructionSites > 3) {
            minBuilders = 2;
        } else if(constructionSites == 0) {
            minBuilders = 0; // No need for builders if nothing to build
        }

        // Get energy info for spawning
        var energyAvailable = Game.spawns['Spawn1'].room.energyAvailable;
        var energyCapacity = Game.spawns['Spawn1'].room.energyCapacityAvailable;
        
        cpuTracker.populationCalc = Game.cpu.getUsed() - popCalcStartCpu;

        // Spawning logic - track CPU
        const spawnStartCpu = Game.cpu.getUsed();
        
        // Only spawn if we're not already spawning
        // This is a partial snippet to replace in main.js to improve spawn logic

// Replace the spawning section in main.js with this improved code
// Find this line: if(!Game.spawns['Spawn1'].spawning) {
// And replace the entire spawning block with this:

if(!Game.spawns['Spawn1'].spawning) {
    // Emergency mode: If we have no harvesters and no haulers, make a small one immediately
    if(harvesters.length == 0 && haulers.length == 0) {
        var newName = 'Harvester'+Game.time;
        console.log('EMERGENCY SPAWNING harvester: ' + newName);
        Game.spawns['Spawn1'].spawnCreep([WORK,CARRY,MOVE], newName, 
            {memory: {role: 'harvester', number: harvesters.length}});
    }
    // Normal operations
    else if(energyAvailable >= 300) { // Basic creep cost
        // Priority order: Harvesters > Haulers > Upgraders > Builders
        if(harvesters.length < minHarvesters) {
            var newName = 'Harvester' + Game.time;
            console.log('Spawning new harvester: ' + newName);
            
            // Harvester design: lots of WORK, minimal CARRY/MOVE
            var bodyParts = energyAvailable >= 550 ? 
                [WORK,WORK,WORK,WORK,CARRY,MOVE] : 
                [WORK,WORK,CARRY,MOVE];
                
            Game.spawns['Spawn1'].spawnCreep(bodyParts, newName, 
                {memory: {role: 'harvester', number: harvesters.length}});
        }
        else if(haulers.length < minHaulers) {
            var newName = 'Hauler' + Game.time;
            console.log('Spawning new hauler: ' + newName);
            
            // Hauler design: balanced CARRY and MOVE for better efficiency
            // Use more MOVE parts to prevent traffic jams
            var bodyParts;
            
            if(energyAvailable >= 800) {
                bodyParts = [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
            } else if(energyAvailable >= 550) {
                bodyParts = [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE];
            } else {
                bodyParts = [CARRY,CARRY,MOVE,MOVE];
            }
            
            // Assign a number to haulers (like harvesters) for better distribution
            Game.spawns['Spawn1'].spawnCreep(bodyParts, newName,
                {memory: {
                    role: 'hauler',
                    number: haulers.length,
                    // Don't assign targetHarvester yet - do it when the hauler runs
                }});
        }
        else if(upgraders.length < minUpgraders) {
            var newName = 'Upgrader' + Game.time;
            console.log('Spawning new upgrader: ' + newName);
            
            var bodyParts;
            if(energyAvailable >= 750) {
                bodyParts = [WORK,WORK,WORK,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE];
            } else if(energyAvailable >= 550) {
                bodyParts = [WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE];
            } else {
                bodyParts = [WORK,CARRY,MOVE];
            }
                
            Game.spawns['Spawn1'].spawnCreep(bodyParts, newName,
                {memory: {role: 'upgrader'}});
        }
        else if(builders.length < minBuilders && constructionSites > 0) {
            var newName = 'Builder' + Game.time;
            console.log('Spawning new builder: ' + newName);
            
            var bodyParts;
            if(energyAvailable >= 750) {
                bodyParts = [WORK,WORK,WORK,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE];
            } else if(energyAvailable >= 550) {
                bodyParts = [WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE];
            } else {
                bodyParts = [WORK,CARRY,MOVE];
            }
                
            Game.spawns['Spawn1'].spawnCreep(bodyParts, newName,
                {memory: {role: 'builder'}});
        }
        // Optional: Create bigger/better creeps when we have excess energy
        else if(energyAvailable >= energyCapacity * 0.9) {
            // Spawn additional haulers when energy is abundant
            // This helps with energy distribution
            var newName = 'Hauler' + Game.time;
            var bodyParts = [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
            Game.spawns['Spawn1'].spawnCreep(bodyParts, newName,
                {memory: {
                    role: 'hauler',
                    number: haulers.length
                }});
        }
    }
}

        // Display visual indicator when spawning
        if(Game.spawns['Spawn1'].spawning) { 
            var spawningCreep = Game.creeps[Game.spawns['Spawn1'].spawning.name];
            Game.spawns['Spawn1'].room.visual.text(
                '🛠️' + spawningCreep.memory.role,
                Game.spawns['Spawn1'].pos.x + 1, 
                Game.spawns['Spawn1'].pos.y, 
                {align: 'left', opacity: 0.8});
        }
        
        cpuTracker.spawning = Game.cpu.getUsed() - spawnStartCpu;

        // Creep control logic - track CPU
        const creepControlStartCpu = Game.cpu.getUsed();
        
        // Run role logic for each creep with try-catch to catch individual errors
        for(var name in Game.creeps) {
            try {
                var creep = Game.creeps[name];
                if(creep.memory.role == 'harvester') {
                    roleHarvester.run(creep);
                }
                else if(creep.memory.role == 'upgrader') {
                    roleUpgrader.run(creep);
                }
                else if(creep.memory.role == 'builder') {
                    roleBuilder.run(creep);
                }
                else if(creep.memory.role == 'hauler') {
                    roleHauler.run(creep);
                }
                else {
                    console.log(`Creep ${name} has unknown role: ${creep.memory.role}`);
                }
            } catch(e) {
                console.log(`Error running creep ${name} with role ${creep.memory.role || 'unknown'}: ${e}`);
                console.log(`Stack trace: ${e.stack}`);
            }
        }
        
        cpuTracker.creepControl = Game.cpu.getUsed() - creepControlStartCpu;
        
    } catch(e) {
        console.log(`Major error in main loop: ${e}`);
        console.log(`Stack trace: ${e.stack}`);
    }
    
    // Log CPU usage at the end
    const endCpu = Game.cpu.getUsed();
    console.log(`Tick ${Game.time} ending. CPU Used: ${endCpu.toFixed(2)}/${Game.cpu.limit} ` +
                `(${((endCpu/Game.cpu.limit)*100).toFixed(0)}%)`);
    console.log(`CPU breakdown - Memory: ${cpuTracker.memoryCleanup.toFixed(2)}, ` +
                `Counting: ${cpuTracker.creepCounting.toFixed(2)}, ` +
                `Population: ${cpuTracker.populationCalc.toFixed(2)}, ` +
                `Spawning: ${cpuTracker.spawning.toFixed(2)}, ` +
                `Creep Control: ${cpuTracker.creepControl.toFixed(2)}`);
};