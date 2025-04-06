import "./types";

export const movement: MovementModule = {
    moveToRoom(creep: Creep, targetRoom: string): boolean {
        if (creep.room.name !== targetRoom) {
            const exitDir = Game.map.findExit(creep.room, targetRoom);
            const exit = creep.pos.findClosestByPath(exitDir);
            if (exit) {
                creep.moveTo(exit);
            }
            return false;
        }
        return true;
    }
};

module.exports = movement;
