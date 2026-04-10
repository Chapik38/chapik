# Monopoly Express + MySQL

Серверная реализация онлайн-версии «Монополии» на **Express.js** и **MySQL**.

Проект опирается на ТЗ: комнаты на 2–6 игроков, сервер как источник истины, транзакционные игровые действия, журнал событий, аукционы, ипотека, тюрьма и восстановление состояния после переподключения.

## Что реализовано
- регистрация и вход (JWT)
- комнаты ожидания
- запуск игровой сессии
- базовая инициализация классической доски
- серверный бросок кубиков
- покупка собственности
- аукцион банка по объекту
- выплата ренты
- налог, шанс/казна, тюрьма, старт
- залог имущества
- журнал событий
- API состояния партии

## Установка
```bash
npm install
cp .env.example .env
```

Создайте БД:
```sql
CREATE DATABASE monopoly_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Примените схему и сиды:
```bash
npm run db:init
npm run db:seed
```

Запуск:
```bash
npm run dev
```


Что уже работает:

POST /api/auth/register

POST /api/auth/login

POST /api/rooms

POST /api/rooms/:roomId/join

POST /api/rooms/:roomId/start

GET /api/sessions/:sessionId/state

POST /api/sessions/:sessionId/roll

POST /api/sessions/:sessionId/buy

POST /api/sessions/:sessionId/auction/start

POST /api/sessions/:sessionId/auction/bid

POST /api/sessions/:sessionId/auction/finish

POST /api/sessions/:sessionId/mortgage

POST /api/sessions/:sessionId/end-turn