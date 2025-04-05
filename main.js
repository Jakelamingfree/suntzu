// Enhanced Screeps script with multi-room harvesting

// Role definitions
var roleHarvester = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // If creep isn't full of energy, go harvest
        if(creep.store.getFreeCapacity() > 0) {
            var sources = creep.room.find(FIND_SOURCES);
            // Move to the first source and harvest
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
        // If creep is full, transfer energy to spawn or extensions
        else {
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN) &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            
            if(targets.length > 0) {
                if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            // If no spawn/extensions need energy, transfer to controller
            else {
                if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }
    }
};

var roleBuilder = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // If creep is out of energy, go get more
        if(creep.store[RESOURCE_ENERGY] == 0) {
            var sources = creep.room.find(FIND_SOURCES);
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
        // If creep has energy, find construction sites and build
        else {
            var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
            if(targets.length) {
                if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            // If no construction sites, upgrade controller instead
            else {
                if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }
    }
};

var roleUpgrader = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // If creep is out of energy, go get more
        if(creep.store[RESOURCE_ENERGY] == 0) {
            var sources = creep.room.find(FIND_SOURCES);
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
        // If creep has energy, upgrade the controller
        else {
            if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }
};

// New role: Scout - explores adjacent rooms and identifies harvestable sources
var roleScout = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // If in home room and we need to scout
        if(creep.memory.exploring == undefined) {
            creep.memory.exploring = true;
            creep.memory.homeRoom = creep.room.name;
            
            // Find exit to an unexplored room (or least recently explored)
            this.findNewRoomToExplore(creep);
        }
        
        // If we have a target room, move towards it
        if(creep.memory.targetRoom && creep.room.name != creep.memory.targetRoom) {
            // Find exit to target room
            const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
            const exit = creep.pos.findClosestByPath(exitDir);
            creep.moveTo(exit, {visualizePathStyle: {stroke: '#ffaa00'}});
        }
        // If we're in the target room, scan it
        else if(creep.memory.targetRoom && creep.room.name == creep.memory.targetRoom) {
            this.scanRoom(creep);
            
            // After scanning, head back home or to a new room
            if(creep.memory.homeRoom && creep.room.name != creep.memory.homeRoom) {
                creep.memory.targetRoom = creep.memory.homeRoom;
            } else {
                this.findNewRoomToExplore(creep);
            }
        }
    },
    
    /** Find a new room to explore **/
    findNewRoomToExplore: function(creep) {
        // Get list of exits from current room
        const exits = Game.map.describeExits(creep.room.name);
        
        // Filter to rooms we haven't explored recently (or ever)
        const roomMemory = Memory.rooms || {};
        let candidates = [];
        
        for(const exitDir in exits) {
            const roomName = exits[exitDir];
            const lastVisit = roomMemory[roomName] ? roomMemory[roomName].lastVisit || 0 : 0;
            
            // Consider rooms not visited in the last 1000 ticks
            if(Game.time - lastVisit > 1000) {
                candidates.push({
                    name: roomName,
                    exitDir: exitDir,
                    lastVisit: lastVisit
                });
            }
        }
        
        // Sort by least recently visited
        candidates.sort((a, b) => a.lastVisit - b.lastVisit);
        
        if(candidates.length > 0) {
            creep.memory.targetRoom = candidates[0].name;
        } else {
            // If all rooms recently explored, pick a random one
            const exitDirs = Object.keys(exits);
            if(exitDirs.length > 0) {
                const randomDir = exitDirs[Math.floor(Math.random() * exitDirs.length)];
                creep.memory.targetRoom = exits[randomDir];
            }
        }
    },
    
    /** Scan the current room for resources and hostile presence **/
    scanRoom: function(creep) {
        // Initialize room memory if needed
        if(!Memory.rooms) Memory.rooms = {};
        if(!Memory.rooms[creep.room.name]) Memory.rooms[creep.room.name] = {};
        
        const roomMem = Memory.rooms[creep.room.name];
        
        // Record this visit
        roomMem.lastVisit = Game.time;
        
        // Check for hostile presence (players only, not NPC Invaders)
        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS, {
            filter: (c) => !c.owner || c.owner.username !== 'Invader'
        });
        
        roomMem.hostilePresence = hostiles.length > 0;
        
        // If no hostiles, scan for sources
        if(!roomMem.hostilePresence) {
            const sources = creep.room.find(FIND_SOURCES);
            roomMem.sources = sources.map(s => ({ id: s.id, pos: { x: s.pos.x, y: s.pos.y } }));
            
            // Check for controller
            if(creep.room.controller) {
                roomMem.controller = {
                    id: creep.room.controller.id,
                    pos: {
                        x: creep.room.controller.pos.x,
                        y: creep.room.controller.pos.y
                    },
                    owner: creep.room.controller.owner ? creep.room.controller.owner.username : null,
                    reservation: creep.room.controller.reservation ? 
                                 creep.room.controller.reservation.username : null
                };
            }
            
            console.log(`Room ${creep.room.name} scanned: ${sources.length} sources, no hostile players.`);
        } else {
            console.log(`Room ${creep.room.name} contains hostile players! Avoiding.`);
        }
    }
};

// New role: RemoteHarvester - harvests from sources in other rooms
var roleRemoteHarvester = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Initialize memory if needed
        if(creep.memory.working === undefined) {
            creep.memory.working = false;
            creep.memory.homeRoom = creep.room.name;
            
            // Assign a target room and source
            this.assignHarvestTarget(creep);
        }
        
        // If we're full, go back to deposit
        if(creep.store.getFreeCapacity() == 0) {
            creep.memory.working = true;
        }
        // If we're empty, go back to harvesting
        if(creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.working = false;
        }
        
        // If working (bringing energy back)
        if(creep.memory.working) {
            // If not in home room, move there
            if(creep.room.name != creep.memory.homeRoom) {
                const exitDir = Game.map.findExit(creep.room, creep.memory.homeRoom);
                const exit = creep.pos.findClosestByPath(exitDir);
                creep.moveTo(exit, {visualizePathStyle: {stroke: '#ffffff'}});
            } else {
                // Deliver energy to spawn or extensions
                var targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.structureType == STRUCTURE_EXTENSION ||
                                structure.structureType == STRUCTURE_SPAWN) &&
                                structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                
                if(targets.length > 0) {
                    if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
                // If structures are full, store in storage if available
                else {
                    var storage = creep.room.storage;
                    if(storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        if(creep.transfer(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffffff'}});
                        }
                    }
                    // Last resort - upgrade controller
                    else if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
        }
        // If not working (going to harvest)
        else {
            // If we have a target room and source
            if(creep.memory.targetRoom && creep.memory.targetSource) {
                // If not in target room, move there
                if(creep.room.name != creep.memory.targetRoom) {
                    const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
                    const exit = creep.pos.findClosestByPath(exitDir);
                    creep.moveTo(exit, {visualizePathStyle: {stroke: '#ffaa00'}});
                } else {
                    // In target room, check if there are hostiles
                    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS, {
                        filter: (c) => !c.owner || c.owner.username !== 'Invader'
                    });
                    
                    // If hostiles found, retreat
                    if(hostiles.length > 0) {
                        // Update room memory
                        if(!Memory.rooms) Memory.rooms = {};
                        if(!Memory.rooms[creep.room.name]) Memory.rooms[creep.room.name] = {};
                        Memory.rooms[creep.room.name].hostilePresence = true;
                        Memory.rooms[creep.room.name].lastHostileTime = Game.time;
                        
                        console.log(`Remote harvester detected hostiles in ${creep.room.name}. Retreating!`);
                        
                        // Retreat to home room
                        const exitDir = Game.map.findExit(creep.room, creep.memory.homeRoom);
                        const exit = creep.pos.findClosestByPath(exitDir);
                        creep.moveTo(exit, {visualizePathStyle: {stroke: '#ff0000'}});
                        
                        // Reset target assignment for next cycle
                        delete creep.memory.targetRoom;
                        delete creep.memory.targetSource;
                    } else {
                        // No hostiles, harvest the source
                        const source = Game.getObjectById(creep.memory.targetSource);
                        if(source) {
                            if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
                                creep.moveTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
                            }
                        } else {
                            // Source not found, reset assignment
                            delete creep.memory.targetRoom;
                            delete creep.memory.targetSource;
                            this.assignHarvestTarget(creep);
                        }
                    }
                }
            } else {
                // No target assigned, try to get a new one
                this.assignHarvestTarget(creep);
                
                // If still no target, fall back to harvesting in home room
                if(!creep.memory.targetRoom) {
                    var sources = creep.room.find(FIND_SOURCES);
                    if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
            }
        }
    },
    
    /** Assign a remote source to harvest **/
    assignHarvestTarget: function(creep) {
        // Look for viable room in memory
        if(!Memory.rooms) return;
        
        let candidateRooms = [];
        
        // Collect rooms with sources and no hostiles
        for(const roomName in Memory.rooms) {
            const roomMem = Memory.rooms[roomName];
            
            // Skip home room
            if(roomName == creep.memory.homeRoom) continue;
            
            // Check if room has sources and no hostiles
            if(roomMem.sources && roomMem.sources.length > 0 && 
              (!roomMem.hostilePresence || 
              (roomMem.lastHostileTime && Game.time - roomMem.lastHostileTime > 1500))) {
                
                // Check if controller exists and is owned/reserved
                if(!roomMem.controller || 
                  (!roomMem.controller.owner && !roomMem.controller.reservation)) {
                    candidateRooms.push({
                        name: roomName,
                        sources: roomMem.sources,
                        lastVisit: roomMem.lastVisit || 0
                    });
                }
            }
        }
        
        // Sort by most recent visit (we want to maintain presence)
        candidateRooms.sort((a, b) => b.lastVisit - a.lastVisit);
        
        if(candidateRooms.length > 0) {
            const targetRoom = candidateRooms[0];
            
            // Assign a source - distribute among creeps by using creep name hash
            const sourceIndex = creep.name.charCodeAt(creep.name.length - 1) % targetRoom.sources.length;
            
            creep.memory.targetRoom = targetRoom.name;
            creep.memory.targetSource = targetRoom.sources[sourceIndex].id;
            
            console.log(`Remote harvester ${creep.name} assigned to room ${targetRoom.name}, source ${creep.memory.targetSource}`);
        }
    }
};

// Room manager module - handles room-level logic
var roomManager = {
    /** Run room management tasks **/
    run: function(room) {
        // Skip rooms we don't own
        if(!room.controller || !room.controller.my) return;
        
        // Run every 10 ticks to save CPU
        if(Game.time % 10 !== 0) return;
        
        // Initialize room memory
        if(!Memory.rooms[room.name]) {
            Memory.rooms[room.name] = {
                sources: room.find(FIND_SOURCES).map(s => ({ 
                    id: s.id, 
                    pos: { x: s.pos.x, y: s.pos.y } 
                }))
            };
        }
        
        // Check if we need to send out scouts
        this.manageExploration(room);
    },
    
    /** Manage exploration of nearby rooms **/
    manageExploration: function(room) {
        // Only run exploration logic every 50 ticks
        if(Game.time % 50 !== 0) return;
        
        // Get list of exits
        const exits = Game.map.describeExits(room.name);
        let roomsToExplore = [];
        
        // Check which adjacent rooms need exploration
        for(const dir in exits) {
            const roomName = exits[dir];
            const roomMem = Memory.rooms[roomName];
            
            // Room never visited or not visited in last 1000 ticks
            if(!roomMem || !roomMem.lastVisit || Game.time - roomMem.lastVisit > 1000) {
                roomsToExplore.push(roomName);
            }
        }
        
        // If rooms need exploration, set the flag
        if(roomsToExplore.length > 0) {
            room.memory.needsExploration = true;
        } else {
            room.memory.needsExploration = false;
        }
    }
};

// Spawn manager - handles creep spawning logic
var spawnManager = {
    /** Run spawn logic for a spawn **/
    run: function(spawn) {
        // Check if spawn is already busy
        if(spawn.spawning) return;
        
        // Get room for this spawn
        const room = spawn.room;
        
        // Calculate current creep counts by role
        const creepCounts = this.countCreepsByRole();
        
        // Determine what to spawn next
        const nextRole = this.getNextCreepRole(creepCounts, room);
        
        // If we should spawn a creep
        if(nextRole) {
            // Get body for this role and energy available
            const body = this.getCreepBody(nextRole, room.energyAvailable);
            
            // Generate a unique name
            const name = nextRole.charAt(0).toUpperCase() + nextRole.slice(1) + Game.time;
            
            // Spawn the creep
            const result = spawn.spawnCreep(body, name, {
                memory: { role: nextRole }
            });
            
            if(result === OK) {
                console.log(`Spawning new ${nextRole}: ${name}`);
            }
        }
    },
    
    /** Count creeps by role **/
    countCreepsByRole: function() {
        let counts = {
            harvester: 0,
            upgrader: 0,
            builder: 0,
            scout: 0,
            remoteHarvester: 0
        };
        
        for(const name in Game.creeps) {
            const creep = Game.creeps[name];
            if(counts[creep.memory.role] !== undefined) {
                counts[creep.memory.role]++;
            }
        }
        
        return counts;
    },
    
    /** Determine what role to spawn next **/
    getNextCreepRole: function(counts, room) {
        // Always maintain minimum harvesters
        if(counts.harvester < 2) {
            return 'harvester';
        }
        
        // If we need scouts, spawn one
        if(room.memory.needsExploration && counts.scout < 1) {
            return 'scout';
        }
        
        // If we have sources in other rooms, spawn remote harvesters
        let remoteSourcesAvailable = 0;
        for(const roomName in Memory.rooms) {
            // Skip our room
            if(roomName === room.name) continue;
            
            const roomMem = Memory.rooms[roomName];
            // Count sources in safe rooms
            if(roomMem.sources && roomMem.sources.length > 0 && 
               (!roomMem.hostilePresence || 
               (roomMem.lastHostileTime && Game.time - roomMem.lastHostileTime > 1500))) {
                remoteSourcesAvailable += roomMem.sources.length;
            }
        }
        
        // Spawn remote harvesters based on available remote sources
        if(remoteSourcesAvailable > counts.remoteHarvester && counts.remoteHarvester < 4) {
            return 'remoteHarvester';
        }
        
        // Maintain minimum upgraders
        if(counts.upgrader < 1) {
            return 'upgrader';
        }
        
        // Check if we need builders
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        if(sites.length > 0 && counts.builder < 2) {
            return 'builder';
        }
        
        // Spawn more upgraders if we have energy to spare
        if(counts.upgrader < 3) {
            return 'upgrader';
        }
        
        // If we're maxed on other roles, add more remote harvesters
        if(remoteSourcesAvailable > counts.remoteHarvester && counts.remoteHarvester < 8) {
            return 'remoteHarvester';
        }
        
        // Default: don't spawn anything
        return null;
    },
    
    /** Get body parts for a creep based on role and available energy **/
    getCreepBody: function(role, energy) {
        // Minimum viable creep
        if(energy < 300) {
            return [WORK, CARRY, MOVE];
        }
        
        // Body part templates by role
        let body = [];
        
        switch(role) {
            case 'harvester':
                // Balanced - can work and carry
                if(energy >= 550) {
                    body = [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
                } else if(energy >= 400) {
                    body = [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
                } else {
                    body = [WORK, WORK, CARRY, MOVE];
                }
                break;
                
            case 'upgrader':
                // More WORK parts for efficiency
                if(energy >= 550) {
                    body = [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE];
                } else if(energy >= 400) {
                    body = [WORK, WORK, WORK, CARRY, MOVE];
                } else {
                    body = [WORK, WORK, CARRY, MOVE];
                }
                break;
                
            case 'builder':
                // Balanced
                if(energy >= 550) {
                    body = [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
                } else if(energy >= 400) {
                    body = [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
                } else {
                    body = [WORK, WORK, CARRY, MOVE];
                }
                break;
                
            case 'scout':
                // Fast movement, minimal parts
                if(energy >= 300) {
                    body = [MOVE, MOVE, MOVE];
                } else {
                    body = [MOVE, MOVE];
                }
                break;
                
            case 'remoteHarvester':
                // Extra CARRY and MOVE for long trips
                if(energy >= 650) {
                    body = [WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
                } else if(energy >= 500) {
                    body = [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
                } else if(energy >= 350) {
                    body = [WORK, CARRY, CARRY, MOVE, MOVE];
                } else {
                    body = [WORK, CARRY, MOVE, MOVE];
                }
                break;
                
            default:
                body = [WORK, CARRY, MOVE];
        }
        
        return body;
    }
};

// Main loop
module.exports.loop = function () {
    // Clear memory of dead creeps
    for(var name in Memory.creeps) {
        if(!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }
    
    // Initialize global memory
    if(!Memory.rooms) Memory.rooms = {};
    
    // Run room management for each of our rooms
    for(const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        // Only manage rooms we own
        if(room.controller && room.controller.my) {
            roomManager.run(room);
        }
    }
    
    // Run spawn logic for each spawn
    for(const spawnName in Game.spawns) {
        spawnManager.run(Game.spawns[spawnName]);
    }
    
    // Run creep logic
    for(const name in Game.creeps) {
        const creep = Game.creeps[name];
        
        // Run the appropriate role code
        switch(creep.memory.role) {
            case 'harvester':
                roleHarvester.run(creep);
                break;
            case 'upgrader':
                roleUpgrader.run(creep);
                break;
            case 'builder':
                roleBuilder.run(creep);
                break;
            case 'scout':
                roleScout.run(creep);
                break;
            case 'remoteHarvester':
                roleRemoteHarvester.run(creep);
                break;
        }
    }
    
    // Display status information (every 10 ticks to save CPU)
    if(Game.time % 10 === 0) {
        console.log(`Status - CPU: ${Game.cpu.getUsed().toFixed(2)}/${Game.cpu.limit}, Creeps: ${Object.keys(Game.creeps).length}`);
    }
};
