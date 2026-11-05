import React from 'react'

const Todo = ({ todo, deleteTodo, completeTodo }) => {
  const onClickDelete = () => {
    deleteTodo(todo)
  }

  const onClickComplete = () => {
    completeTodo(todo)
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      maxWidth: '70%',
      margin: 'auto'
    }}>
      <span>{todo.text}</span>

      {todo.done ? (
        <>
          <span>This todo is done</span>
          <button onClick={onClickDelete}>Delete</button>
        </>
      ) : (
        <>
          <span>This todo is not done</span>
          <button onClick={onClickDelete}>Delete</button>
          <button onClick={onClickComplete}>Set as done</button>
        </>
      )}
    </div>
  )
}

export default Todo