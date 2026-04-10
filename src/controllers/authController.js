import * as authService from '../services/authService.js';
export const register = async (req, res, next) => { try { res.status(201).json(await authService.register(req.body)); } catch (e) { next(e); } };
export const login = async (req, res, next) => { try { res.json(await authService.login(req.body)); } catch (e) { next(e); } };
export const me = async (req, res, next) => { try { res.json(await authService.me(req.user.playerId)); } catch (e) { next(e); } };
