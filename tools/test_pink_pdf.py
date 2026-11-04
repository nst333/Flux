import unittest
from pink_pdf import rich, render_source, sample

class PinkPdfTests(unittest.TestCase):
    def test_sample_corrections(self):
        source = render_source(sample())
        self.assertEqual(source.count(r'\place{23}{59}'), 8)
        self.assertNotIn('고난도', source)
        self.assertNotIn('떄', source)
        self.assertIn('최댓값은 $2$', source)
        self.assertIn(r'\usepackage[mathcal]{euler}', source)

    def test_new_problem_does_not_get_sample_corrections(self):
        source = render_source({'problems': [{'blocks': [{'kind':'text','text':'최솟값은 $2$이다.'}]}] * 8})
        self.assertEqual(source.count('최솟값은 $2$'), 8)

    def test_tex_is_data(self):
        self.assertIn(r'\textbackslash{}input', rich(r'\input{secrets}'))
        for value in [r'$\input{secrets}$', r'$\def\x{1}$', r'$\begin{document}x\end{document}$', '$x%evil$']:
            with self.assertRaises(ValueError):
                rich(value)

    def test_math_and_text_preserved(self):
        value = rich(r'조건 50%와 $\frac{1}{2} \leq x$')
        self.assertIn(r'50\%', value)
        self.assertIn(r'$\frac{1}{2} \leq x$', value)

    def test_bad_inputs(self):
        for data in [{'problems': []}, {'problems': [{'blocks':[{'kind':'image'}]}]}, {'problems': [{'blocks':[{'kind':'choices','items':['1']*6}]}]}]:
            with self.assertRaises(ValueError):
                render_source(data)

if __name__ == '__main__':
    unittest.main()
