
const express = require('express');
const { Todo } = require('../mongo');
const { get, set } = require('../redis');

const router = express.Router();

/* GET all todos */
router.get('/', async (req, res, next) => {
  try {
    const todos = await Todo.find({});
    res.json(todos);
  } catch (error) {
    next(error);
  }
});

/* POST a new todo */
router.post('/', async (req, res, next) => {
  try {
    const todo = await Todo.create({
      text: req.body.text,
      done: false
    });

    const currentCount = Number(await get('added_todos')) || 0;
    await set('added_todos', currentCount + 1);

    res.status(201).json(todo);
  } catch (error) {
    next(error);
  }
});

const singleRouter = express.Router();

/* Find todo by ID */
const findByIdMiddleware = async (req, res, next) => {
  try {
    const todo = await Todo.findById(req.params.id);

    if (!todo) {
      return res.sendStatus(404);
    }

    req.todo = todo;
    next();
  } catch (error) {
    if (error.name === 'CastError') {
      return res.sendStatus(400);
    }

    next(error);
  }
};

/* DELETE todo */
singleRouter.delete('/', async (req, res, next) => {
  try {
    await req.todo.deleteOne();
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

/* GET one todo */
singleRouter.get('/', (req, res) => {
  res.json(req.todo);
});

/* PUT update todo */
singleRouter.put('/', async (req, res, next) => {
  try {
    if (req.body.text !== undefined) {
      req.todo.text = req.body.text;
    }

    if (req.body.done !== undefined) {
      req.todo.done = req.body.done;
    }

    const updatedTodo = await req.todo.save();

    res.json(updatedTodo);
  } catch (error) {
    next(error);
  }
});

router.use('/:id', findByIdMiddleware, singleRouter);

module.exports = router;

// Second automatic restart test