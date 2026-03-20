import * as roomService from '../services/roomService.js';
export const createRoom = async (req, res, next) => { try { res.status(201).json(await roomService.createRoom(req.user.playerId, req.body)); } catch (e) { next(e); } };
export const listRooms = async (_req, res, next) => { try { res.json(await roomService.listRooms()); } catch (e) { next(e); } };
export const joinRoom = async (req, res, next) => { try { res.json(await roomService.joinRoom(req.user.playerId, Number(req.params.roomId))); } catch (e) { next(e); } };
export const startRoom = async (req, res, next) => { try { res.json(await roomService.startRoom(req.user.playerId, Number(req.params.roomId))); } catch (e) { next(e); } };
