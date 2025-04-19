// role.scout.js – ring‑aware explorer + path‑length cache
// ------------------------------------------------------------
// Responsibilities
//  • Maintain a breadth‑first (ring) exploration pattern starting from Spawn1’s room
//  • Cache Memory.sources[id].pathLen for each discovered source (for spawnManager)
//  • Mark rooms in Memory.rooms when surveyed
// ------------------------------------------------------------

/**
 * Push exits of a room into Memory.scoutQueue in breadth‑first order.
 * Each queue item: { name: roomName, depth: ringDistance }
 */
function enqueueNeighbors(roomName, depth = 1) {
    const exits = Game.map.describeExits(roomName);
    const q = Memory.scoutQueue = Memory.scoutQueue || [];

    for (const dir in exits) {
        const target = exits[dir];
        // Skip if already in Memory or queued
        if (Memory.rooms && Memory.rooms[target]) continue;
        if (q.find(e => e.name === target)) continue;
        q.push({ name: target, depth });
    }
}

function nextTarget() {
    const q = Memory.scoutQueue = Memory.scoutQueue || [];
    if (!q.length) return null;
    // Sort by ring depth, FIFO order inside same depth
    q.sort((a, b) => a.depth - b.depth);
    return q.shift();
}

var roleScout = {
    /** @param {Creep} creep */
    run: function (creep) {
        // Initialise homeRoom for reference
        if (!creep.memory.homeRoom) creep.memory.homeRoom = Game.spawns['Spawn1'].room.name;

        /* ----------------  Target assignment  ---------------- */
        if (!creep.memory.targetRoom) {
            const tgt = nextTarget();
            if (tgt) {
                creep.memory.targetRoom = tgt.name;
                creep.memory.depth = tgt.depth;
            }
        }

        /* ----------------  Move or survey  ---------------- */
        if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            // Not in target yet – move towards exit
            const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
            if (exitDir !== ERR_NO_PATH) {
                const exit = creep.pos.findClosestByPath(exitDir);
                if (exit) creep.moveTo(exit, { reusePath: 15 });
            } else {
                // Path impossible – drop target and pick new
                delete creep.memory.targetRoom;
            }
            return; // movement takes the tick
        }

        /* ------------  We are in the target room  ------------ */
        this.surveyRoom(creep);

        // Path‑length cache for every source here
        const homePos = Game.spawns['Spawn1'].pos;
        creep.room.find(FIND_SOURCES).forEach(src => {
            const mem = Memory.sources[src.id] = Memory.sources[src.id] || {};
            if (!mem.pathLen) {
                const ret = PathFinder.search(src.pos, { pos: homePos, range: 1 },
                                              { maxOps: 2000, swampCost: 2 });
                if (!ret.incomplete) mem.pathLen = ret.path.length;
            }
        });

        // After surveying, enqueue neighbouring rooms for next ring
        enqueueNeighbors(creep.room.name, (creep.memory.depth || 0) + 1);

        // Clear current target so we fetch a new one next tick
        delete creep.memory.targetRoom;
    },

    /** Record high‑level info about the room into Memory.rooms */
    surveyRoom: function (creep) {
        const room = creep.room;
        const mem = Memory.rooms[room.name] = Memory.rooms[room.name] || {};
        mem.hostiles = mem.hostiles || { count: 0 };
        const hostiles = room.find(FIND_HOSTILE_CREEPS);
        mem.hostiles.count = hostiles.length;
        mem.isSafeForHarvesting = hostiles.length === 0;
        mem.scouted = Game.time;
    }
};

module.exports = roleScout;