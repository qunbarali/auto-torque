@echo off
setlocal
if not exist data mkdir data
if "%DATABASE_URL%"=="" set DATABASE_URL=file:./data/auto_torque.sqlite
echo Auto Torque SQLite database: %DATABASE_URL%
call npx prisma generate
if errorlevel 1 exit /b 1
call npx prisma db push
if errorlevel 1 exit /b 1
echo Database is ready.
