/**
 * Movement coordination module - helps with creep movement coordination and preventing traffic jams
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
        const options = Object.assign({}, defaultOpts, opts);
        
        // Get the previous path from memory
        const prevPath = creep.memory._move ? creep.memory._move.path : null;
        const prevTarget = creep.memory._move ? creep.memory._move.dest : null;
        
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
                        if(blockingCreep.memory._move && blockingCreep.memory._move.path) {
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
                    // Fix: Use Direction constants correctly
                    if(!Game.dirs) {
                        // Game.dirs is not defined in standard Screeps, let's define the deltas ourselves
                        const directionDeltas = {
                            [TOP]: [0, -1],
                            [TOP_RIGHT]: [1, -1],
                            [RIGHT]: [1, 0],
                            [BOTTOM_RIGHT]: [1, 1],
                            [BOTTOM]: [0, 1],
                            [BOTTOM_LEFT]: [-1, 1],
                            [LEFT]: [-1, 0],
                            [TOP_LEFT]: [-1, -1]
                        };
                        
                        const delta = directionDeltas[direction] || [0, 0];
                        const newPos = new RoomPosition(
                            creep.pos.x + delta[0],
                            creep.pos.y + delta[1],
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
                    } else {
                        // Use Game.dirs if it exists
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