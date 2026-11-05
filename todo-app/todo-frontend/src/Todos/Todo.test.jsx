import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, vi, afterEach } from 'vitest'
import Todo from './Todo'

afterEach(() => {
  cleanup()
})
describe('Todo component', () => {
  const todo = {
    id: 1,
    text: 'Learn Docker',
    done: false,
  }

  test('renders todo text and status', () => {
    render(
      <Todo
        todo={todo}
        deleteTodo={() => {}}
        completeTodo={() => {}}
      />
    )

    expect(screen.getByText('Learn Docker')).toBeInTheDocument()
    expect(screen.getByText('This todo is not done')).toBeInTheDocument()
  })

  test('calls completeTodo when Set as done is clicked', () => {
    const completeTodo = vi.fn()

    render(
      <Todo
        todo={todo}
        deleteTodo={() => {}}
        completeTodo={completeTodo}
      />
    )

    fireEvent.click(screen.getByText('Set as done'))

    expect(completeTodo).toHaveBeenCalledWith(todo)
  })

  test('calls deleteTodo when Delete is clicked', () => {
    const deleteTodo = vi.fn()

    render(
      <Todo
        todo={todo}
        deleteTodo={deleteTodo}
        completeTodo={() => {}}
      />
    )

    fireEvent.click(screen.getByText('Delete'))

    expect(deleteTodo).toHaveBeenCalledWith(todo)
  })
})