# Judge Calibration Examples

## Calibration Guide

Используй эти примеры для калибровки. Score 5/5 = редкость (идеальный код).
Score 2/5 = значительные проблемы. Score 4/5 = хорошо с minor gaps.
ПРАВИЛО: если ты ставишь 5.0 по ВСЕМ критериям — это red flag. Перепроверь.

## 1. Correctness

**Score 2/5** — Hardcoded stub вместо реального запроса к БД
```python
def get_user(user_id: int) -> dict:
    return {"id": 1, "name": "Alice", "email": "alice@example.com"}
```
**Why:** Всегда возвращает одни данные независимо от аргумента. Логика не реализована.
**Missing:** Реальный запрос к источнику данных, использование `user_id`.

**Score 4/5** — Корректная логика, error handling, но нет input validation
```python
def get_user(user_id: int) -> User | None:
    try:
        row = db.execute(
            "SELECT id, name, email FROM users WHERE id = %s", (user_id,)
        ).fetchone()
        return User(**row) if row else None
    except DatabaseError as e:
        raise UserRepositoryError(f"Cannot fetch user {user_id}") from e
```
**Why:** Верная логика, параметризованный запрос, корректный return type.
**Missing:** Валидация входного параметра — при `user_id = -5` запрос уйдёт в БД.

## 2. Architecture

**Score 2/5** — Domain слой импортирует SQLAlchemy напрямую
```python
# domain/entities/order.py
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
class Order(DeclarativeBase):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    total: Mapped[float]
    def apply_discount(self, pct: float) -> None:
        self.total *= (1 - pct)
```
**Why:** Domain entity зависит от ORM-фреймворка. Нарушение Clean Architecture: зависимость направлена наружу.
**Missing:** Чистый dataclass в domain; SQLAlchemy-маппинг — в infrastructure/persistence.

**Score 4/5** — Repository pattern корректен, но handler нарушает SRP
```python
class CreateOrderHandler:
    def handle(self, cmd: CreateOrderCommand) -> OrderId:
        if not self._inventory.reserve(cmd.items):
            raise InsufficientStockError()
        order = Order.create(cmd.user_id, cmd.items)
        self._repo.save(order)
        self._notifier.send_confirmation(order)
        self._inventory.commit_reservation(order.id)
        return order.id
```
**Why:** Репозиторий через абстракцию, зависимости инжектируются.
**Missing:** Handler делает >3 вещи (inventory, persistence, notification). По SRP нужны domain events + отдельные обработчики.

## 3. Test Quality

**Score 2/5** — Только happy path, assertion на implementation detail
```python
def test_create_user():
    svc = UserService(MockDB())
    result = svc.create_user("alice", "alice@example.com")
    assert result._db_session is not None
    assert MockDB.insert_called == True
```
**Why:** Проверяет внутренние детали вместо бизнес-факта. Нет edge cases.
**Missing:** Assertions на возвращаемый User; тесты на дубликат email, пустое имя, невалидный email.

**Score 4/5** — Parametrize, AAA, но mock вместо integration test
```python
@pytest.mark.parametrize("name,email,err", [
    ("", "a@b.com", "Name required"),
    ("Alice", "not-email", "Invalid email"),
    ("Alice", "", "Email required"),
])
def test_create_user_invalid_input_raises(name, email, err):
    repo = Mock(spec=UserRepository)
    svc = UserService(repo)
    with pytest.raises(ValidationError, match=err):
        svc.create_user(name, email)
    repo.save.assert_not_called()
```
**Why:** Parametrize покрывает edge cases, AAA соблюдён, assertion — бизнес-факт.
**Missing:** `UserRepository` мокируется, хотя это внутренний компонент. In-memory репозиторий надёжнее.

## 4. Code Quality

**Score 2/5** — Copy-paste, magic numbers, неинформативные имена
```python
def process(x, y, z):
    r1 = x * 0.15
    if r1 > 1000: r1 = 1000
    r2 = y * 0.15
    if r2 > 1000: r2 = 1000
    r3 = z * 0.15
    if r3 > 1000: r3 = 1000
    return r1, r2, r3
```
**Why:** Трёхкратное дублирование, `0.15` и `1000` без пояснений, имена не читаются.
**Missing:** Именованные константы (`TAX_RATE`, `MAX_TAX`), helper-функция, читаемые параметры.

**Score 4/5** — Чистый код, но premature abstraction
```python
class BaseValidator(ABC):
    @abstractmethod
    def validate(self, value: str) -> bool: ...
    def validate_or_raise(self, value: str) -> None:
        if not self.validate(value):
            raise ValidationError(f"Invalid value: {value!r}")

class EmailValidator(BaseValidator):
    _RE = re.compile(r"^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$")
    def validate(self, value: str) -> bool:
        return bool(self._RE.match(value))
```
**Why:** Хорошие имена, паттерн скомпилирован один раз, `validate_or_raise` не дублируется.
**Missing:** `BaseValidator` существует ради одного наследника — YAGNI. Достаточно standalone-функции.

## 5. Security

**Score 2/5** — SQL injection через f-string, пароль в plaintext
```python
def login(username: str, password: str) -> bool:
    query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
    return db.execute(query).fetchone() is not None
```
**Why:** Конкатенация строк = SQL injection. Пароль сравнивается в plaintext.
**Missing:** Параметризованный запрос, password hash (bcrypt/argon2), `secrets.compare_digest`.

**Score 4/5** — Параметризованный запрос, bcrypt, но нет rate limiting
```python
def login(username: str, password: str) -> User | None:
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = %s",
        (username,)
    ).fetchone()
    if row is None or not bcrypt.checkpw(password.encode(), row["password_hash"].encode()):
        return None
    return User(id=row["id"], username=row["username"])
```
**Why:** Параметризованный запрос, bcrypt защищает от timing attacks, нет утечки через разные сообщения.
**Missing:** Нет rate limiting на endpoint — возможен brute-force. Нет audit log failed attempts.
