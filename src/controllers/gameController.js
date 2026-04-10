import * as gameService from '../services/gameService.js';
export const getState = async (req, res, next) => { try { res.json(await gameService.getSessionState(Number(req.params.sessionId))); } catch (e) { next(e); } };
export const roll = async (req, res, next) => { try { res.json(await gameService.roll(Number(req.params.sessionId), req.user.playerId)); } catch (e) { next(e); } };
export const buy = async (req, res, next) => { try { res.json(await gameService.buyProperty(Number(req.params.sessionId), req.user.playerId)); } catch (e) { next(e); } };
export const mortgage = async (req, res, next) => { try { res.json(await gameService.mortgageProperty(Number(req.params.sessionId), req.user.playerId, Number(req.body.propertyDefId))); } catch (e) { next(e); } };
export const endTurn = async (req, res, next) => { try { res.json(await gameService.endTurn(Number(req.params.sessionId), req.user.playerId)); } catch (e) { next(e); } };
export const startAuction = async (req, res, next) => { try { res.json(await gameService.startAuction(Number(req.params.sessionId), req.user.playerId)); } catch (e) { next(e); } };
export const bid = async (req, res, next) => { try { res.json(await gameService.placeBid(Number(req.params.sessionId), req.user.playerId, Number(req.body.bidAmount))); } catch (e) { next(e); } };
export const finishAuction = async (req, res, next) => { try { res.json(await gameService.finishAuction(Number(req.params.sessionId), req.user.playerId)); } catch (e) { next(e); } };
