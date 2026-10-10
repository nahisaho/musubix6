from planner.model import Action, Task

DOMAIN = """(define (domain transport)
(:requirements :strips :typing)
(:types location)
(:predicates (at ?x - location) (edge ?a ?b - location))
(:action move :parameters (?a ?b - location)
 :precondition (and (at ?a) (edge ?a ?b))
 :effect (and (not (at ?a)) (at ?b))))"""
PROBLEM = """(define (problem trip) (:domain transport)
(:objects a b c - location) (:init (at a) (edge a b) (edge b c))
(:goal (at c)))"""


def chain():
    return Task((
        Action("first", pre={("s",)}, add={("m",)}, delete={("s",)}),
        Action("second", pre={("m",)}, add={("g",)}, delete={("m",)}),
    ), frozenset({("s",)}), frozenset({("g",)}))
