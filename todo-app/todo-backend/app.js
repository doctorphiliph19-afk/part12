
const express = require('express');
const logger = require('morgan');
const cors = require('cors');

const indexRouter = require('./routes/index');
const todosRouter = require('./routes/todos');
const { get } = require('./redis');

const app = express();

app.use(cors());

app.use(logger('dev'));
app.use(express.json());

app.get('/statistics', async (req, res, next) => {
  try {
    const addedTodos = Number(await get('added_todos')) || 0;

    res.json({
      added_todos: addedTodos
    });
  } catch (error) {
    next(error);
  }
});

app.use('/', indexRouter);
app.use('/todos', todosRouter);
app.use('/api/todos', todosRouter);

module.exports = app;
