// spawnManager.js – updated bootstrap priority so first hauler spawns second
// ------------------------------------------------------------

const BODY_TIERS = {
    harvester: [
      { cost: 250, parts: [WORK, WORK, MOVE] },
      { cost: 550, parts: [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE] },      // 4W3M
      { cost: 800, parts: [WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE] }
    ],
    hauler: [
      { cost: 300, parts: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE] },        // 4C2M
      { cost: 550, parts: [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                           MOVE, MOVE, MOVE] }                               // 8C3M
    ],
    upgrader: [
      { cost: 300, parts: [WORK, CARRY, CARRY, MOVE] },
      { cost: 550, parts: [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE] },
      { cost: 800, parts: [WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY,
                           MOVE, MOVE, MOVE] }
    ],
    scout: [
      { cost: 300, parts: [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE] }
    ]
  };
  
  function chooseBody(role, cap) {
    const tier = _.max(BODY_TIERS[role].filter(t => t.cost <= cap), 'cost');
    return tier ? tier.parts.slice() : BODY_TIERS[role][0].parts.slice();
  }
  
  function haulersNeededFor(source) {
    const mem = Memory.sources[source.id] || {};
    const miners        = mem.miners || 0;
    const workPerMiner  = 2;
    const ept           = miners * workPerMiner;
    const dist          = mem.pathLen || 20;
    const roundTrip     = dist * 2;
    const flowNeeded    = ept * roundTrip;
    const carryPerHauler = 4 * 50;
    return Math.ceil(flowNeeded / carryPerHauler);
  }
  
  function desiredCounts(room) {
    const srcs = room.find(FIND_SOURCES);
    const desiredHarvesters = srcs.length * 2;
    let desiredHaulers = 0;
    srcs.forEach(s => desiredHaulers += haulersNeededFor(s));
    desiredHaulers = Math.max(desiredHaulers, 1);
  
    let desiredUpgraders;
    if (room.controller.level < 2) desiredUpgraders = 3;
    else {
      const stored = (room.storage && room.storage.store.energy) || 0;
      if (stored > 30000)      desiredUpgraders = 10;
      else if (stored > 5000)  desiredUpgraders = 3;
      else                     desiredUpgraders = 1;
    }
  
    const scoutQueue = Memory.scoutQueue || [];
    const desiredScouts = Math.min(3, scoutQueue.length || 1);
  
    const miners    = _.filter(Game.creeps, c => c.memory.role === 'harvester' && c.memory.homeRoom === room.name).length;
    const haulers   = _.filter(Game.creeps, c => c.memory.role === 'hauler'    && c.memory.homeRoom === room.name).length;
    const upgraders = _.filter(Game.creeps, c => c.memory.role === 'upgrader'  && c.memory.homeRoom === room.name).length;
    const scouts    = _.filter(Game.creeps, c => c.memory.role === 'scout').length;
  
    return { srcCount: srcs.length,
             desired: { miners: desiredHarvesters, haulers: desiredHaulers, upgraders: desiredUpgraders, scouts: desiredScouts },
             counts:  { miners, haulers, upgraders, scouts } };
  }
  
  function run(room) {
    const spawner = room.find(FIND_MY_SPAWNS)[0];
    if (!spawner || spawner.spawning) return;
  
    const { srcCount, desired, counts } = desiredCounts(room);
  
    // If we already have at least one miner per source but not yet a hauler per source,
    // make sure the *next* spawn is a hauler.
    const bootstrapHaulerNeeded = counts.miners >= srcCount && counts.haulers < srcCount;
  
    const queue = [
      { role: 'harvester', want: counts.miners    < desired.miners,    prio: bootstrapHaulerNeeded ? 9  : 10 },
      { role: 'hauler',    want: counts.haulers   < desired.haulers,   prio: bootstrapHaulerNeeded ? 11 :  9 },
      { role: 'scout',     want: counts.scouts    < desired.scouts,    prio: 8  },
      { role: 'upgrader',  want: counts.upgraders < desired.upgraders, prio: 5  }
    ].filter(q => q.want).sort((a,b)=>b.prio-a.prio);
  
    if (!queue.length) return;
  
    const { role } = queue[0];
    const body  = chooseBody(role, room.energyCapacityAvailable);
    const name  = `${role}_${Game.time}`;
    const memory = { role, homeRoom: room.name };
    if (role === 'harvester') memory.sourceId = null;
  
    const res = spawner.spawnCreep(body, name, { memory });
    if (res === OK) console.log(`🛠️ Spawned ${role} (${name}) in ${room.name}`);
    else            console.log(`Spawn failed for ${role}: ${res}`);
  }
  
  module.exports = { run };
  