module.exports = {
    moveToRoom(creep, targetRoom) {
        if (creep.room.name !== targetRoom) {
            const exitDir = Game.map.findExit(creep.room, targetRoom);
            const exit = creep.pos.findClosestByPath(exitDir);
            creep.moveTo(exit);
            return false;
        }
        return true;
    }
};
