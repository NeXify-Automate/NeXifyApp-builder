/**
 * NeXifyAI Builder - Interview Modal
 * Stellt 3-5 klärende Design-Fragen vor Konzept-Erstellung
 */

import React, { useState } from 'react';
import { X, Sparkles, Palette, Target, Globe, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { validateUrl } from '../lib/urlAnalyzer';

export interface InterviewAnswers {
  designStyle?: string;
  targetAudience?: string;
  colorPreferences?: string[];
  referenceUrl?: string;
  features?: string[];
}

interface InterviewModalProps {
  onComplete: (answers: InterviewAnswers) => void;
  onSkip: () => void;
}

const INTERVIEW_QUESTIONS = [
  {
    id: 'designStyle',
    question: 'Welchen Design-Stil bevorzugst du?',
    icon: Palette,
    options: [
      'Modern & Minimalistisch',
      'Bold & Energetisch',
      'Elegant & Premium',
      'Tech & Futuristisch',
      'Warm & Einladend'
    ],
    allowMultiple: false
  },
  {
    id: 'targetAudience',
    question: 'Wer ist deine Zielgruppe?',
    icon: Target,
    options: [
      'B2B Professionals',
      'Endverbraucher',
      'Tech-Enthusiasten',
      'Kreative',
      'Unternehmen'
    ],
    allowMultiple: false
  },
  {
    id: 'colorPreferences',
    question: 'Welche Farben passen zu deiner Marke? (Mehrfachauswahl möglich)',
    icon: Palette,
    options: [
      'Blau-Töne',
      'Grün-Töne',
      'Rot/Orange',
      'Lila/Pink',
      'Grau/Schwarz',
      'Warm-Töne',
      'Kalt-Töne'
    ],
    allowMultiple: true
  },
  {
    id: 'referenceUrl',
    question: 'Hast du eine Referenz-Website, die dir gefällt? (Optional)',
    icon: Globe,
    placeholder: 'https://example.com',
    type: 'url'
  },
  {
    id: 'features',
    question: 'Welche Features sind dir am wichtigsten? (Mehrfachauswahl möglich)',
    icon: Sparkles,
    options: [
      'User-Authentifizierung',
      'E-Commerce',
      'Dashboard/Analytics',
      'Social Features',
      'Content Management',
      'API Integration',
      'Mobile-First'
    ],
    allowMultiple: true
  }
];

export const InterviewModal: React.FC<InterviewModalProps> = ({ onComplete, onSkip }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<InterviewAnswers>({});

  const question = INTERVIEW_QUESTIONS[currentQuestion];
  const isLastQuestion = currentQuestion === INTERVIEW_QUESTIONS.length - 1;
  const Icon = question.icon;

  const handleAnswer = (value: string) => {
    if (question.allowMultiple) {
      const currentAnswers = (answers[question.id as keyof InterviewAnswers] as string[]) || [];
      const newAnswers = currentAnswers.includes(value)
        ? currentAnswers.filter(a => a !== value)
        : [...currentAnswers, value];
      setAnswers({ ...answers, [question.id]: newAnswers });
    } else {
      setAnswers({ ...answers, [question.id]: value });
    }
  };

  const handleNext = () => {
    if (isLastQuestion) {
      onComplete(answers);
    } else {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const handleUrlChange = (url: string) => {
    if (url && !validateUrl(url)) {
      // Zeige Fehler (könnte in UI angezeigt werden)
      console.warn('Ungültige URL:', url);
      return;
    }
    setAnswers({ ...answers, referenceUrl: url });
  };

  const getAnswerForQuestion = (questionId: string): string | string[] | undefined => {
    return answers[questionId as keyof InterviewAnswers];
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#0B0F17] border-b border-slate-800 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Sparkles className="text-blue-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Projekt-Interview</h2>
              <p className="text-sm text-slate-400">
                Frage {currentQuestion + 1} von {INTERVIEW_QUESTIONS.length}
              </p>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${((currentQuestion + 1) / INTERVIEW_QUESTIONS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Icon className="text-blue-400" size={24} />
              <h3 className="text-lg font-semibold text-white">{question.question}</h3>
            </div>

            {/* Answer Options */}
            {question.type === 'url' ? (
              <input
                type="url"
                placeholder={question.placeholder}
                value={(getAnswerForQuestion(question.id) as string) || ''}
                onChange={(e) => handleUrlChange(e.target.value)}
                className="w-full bg-[#020408] border border-slate-700 rounded-lg p-3 text-slate-200 focus:border-blue-500 outline-none"
              />
            ) : (
              <div className="space-y-2">
                {question.options?.map((option) => {
                  const isSelected = question.allowMultiple
                    ? (getAnswerForQuestion(question.id) as string[])?.includes(option)
                    : getAnswerForQuestion(question.id) === option;

                  return (
                    <button
                      key={option}
                      onClick={() => handleAnswer(option)}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-blue-500/20 border-blue-500 text-white'
                          : 'bg-[#020408] border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{option}</span>
                        {isSelected && <CheckCircle2 className="text-blue-400" size={20} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={handleBack}
              disabled={currentQuestion === 0}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Zurück
            </button>

            <button
              onClick={onSkip}
              className="px-4 py-2 text-slate-400 hover:text-slate-300 transition-colors"
            >
              Überspringen
            </button>

            <button
              onClick={handleNext}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {isLastQuestion ? (
                <>
                  <CheckCircle2 size={18} />
                  Abschließen
                </>
              ) : (
                'Weiter'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

