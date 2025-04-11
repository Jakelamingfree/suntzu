// role.scout.js – Scout role logic (explores adjacent rooms and records intel in Memory)

const roleScout = {
    /** @param {Creep} creep **/
    run: function(creep) {
        // Ensure homeRoom is in memory (the room from which we start scouting)
        const homeRoom = creep.memory.homeRoom || creep.room.name;
        creep.memory.homeRoom = homeRoom;

        // If creep is in a room that is not its target, move towards the target
        if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            // Move toward the center of target room to trigger room entry
            creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom), { visualizePathStyle: { stroke: '#ffaa00' } });
            return; // wait until we enter the room
        }

        // If we have arrived in the target room, gather intel
        if (creep.memory.targetRoom && creep.room.name === creep.memory.targetRoom) {
            const roomName = creep.room.name;
            // Record information about this room in Memory
            if (!Memory.rooms[roomName]) {
                Memory.rooms[roomName] = {};
            }
            Memory.rooms[roomName].lastScouted = Game.time;
            // Record number of sources and their positions (basic terrain info could be added as needed)
            const sources = creep.room.find(FIND_SOURCES);
            Memory.rooms[roomName].sourceCount = sources.length;
            Memory.rooms[roomName].sources = sources.map(s => ({ x: s.pos.x, y: s.pos.y }));
            // Record controller info (if present)
            if (creep.room.controller) {
                if (creep.room.controller.owner) {
                    Memory.rooms[roomName].owner = creep.room.controller.owner.username;
                } else if (creep.room.controller.reservation) {
                    Memory.rooms[roomName].reservation = creep.room.controller.reservation.username;
                } else {
                    Memory.rooms[roomName].owner = null; // unowned controller
                }
            } else {
                Memory.rooms[roomName].owner = null; // no controller (could be highway or SK room)
            }
            // (Additional terrain analysis can be done via Game.map.getRoomTerrain if needed)

            // Clear target so we can pick a new room next
            creep.memory.targetRoom = null;
        }

        // Determine next room to scout if not currently assigned
        if (!creep.memory.targetRoom) {
            // Get adjacent rooms from the home room
            const exits = Game.map.describeExits(homeRoom);
            // Choose the next exit room that hasn't been scouted recently
            let nextRoom = null;
            let oldestTime = Game.time;
            for (const dir in exits) {
                const roomName = exits[dir];
                const lastScouted = Memory.rooms[roomName] && Memory.rooms[roomName].lastScouted;
                if (!lastScouted || Game.time - lastScouted > 1000) {
                    // If never scouted or scouted more than 1000 ticks ago, consider this room
                    if (!nextRoom || (lastScouted && lastScouted < oldestTime)) {
                        nextRoom = roomName;
                        oldestTime = lastScouted || 0;
                    }
                }
            }
            if (nextRoom) {
                creep.memory.targetRoom = nextRoom;
            } else {
                // All neighbors recently scouted; no immediate scouting task. 
                // The scout can return home or idle for a while.
                if (creep.room.name !== homeRoom) {
                    creep.moveTo(new RoomPosition(25, 25, homeRoom), { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            }
        }
    }
};

module.exports = roleScout;
