import Link from './Link'
import NotFound from './NotFound'
import PracticeRoute from './practice/PracticeRoute'
import QuestionsScreen from './questions/QuestionsScreen'
import { parseRoute, usePathname } from './router'

function App() {
  const route = parseRoute(usePathname())

  return (
    <>
      <header className="app-header">
        <Link to="/" className="logo" aria-label="umless, back to questions">
          um<span>less</span>
        </Link>
        {route.name === 'practice' && (
          <nav aria-label="Practice">
            <Link to="/">← Questions</Link>
          </nav>
        )}
      </header>
      <main>
        {route.name === 'questions' && <QuestionsScreen />}
        {route.name === 'practice' && <PracticeRoute key={route.questionId} questionId={route.questionId} />}
        {route.name === 'notFound' && <NotFound />}
      </main>
    </>
  )
}

export default App
