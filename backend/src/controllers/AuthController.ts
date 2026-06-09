import { Request, Response } from 'express';
import { Repository } from 'typeorm';
import AppDataSource from '../database/data-source';
import { User, UserRole } from '../entities/User';
import { gerarToken } from '../middlewares/authMiddleware';

class AuthController {
  private get repository(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  /**
   * POST /api/auth/register
   * Cria um novo usuário (apenas admin pode criar outros admins)
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { nome, email, senha, role } = req.body;

      // Validações básicas
      if (!nome || !email || !senha) {
        res.status(400).json({
          error: 'Campos obrigatórios: nome, email, senha',
        });
        return;
      }

      if (senha.length < 6) {
        res.status(400).json({
          error: 'Senha deve ter no mínimo 6 caracteres',
        });
        return;
      }

      // Verifica se email já existe
      const existente = await this.repository.findOne({
        where: { email: email.toLowerCase().trim() },
      });

      if (existente) {
        res.status(409).json({ error: 'Email já cadastrado' });
        return;
      }

      // Se não for admin, força role 'user'
      let roleFinal: UserRole = 'user';
      if (role === 'admin' && req.usuario?.role === 'admin') {
        roleFinal = 'admin';
      }

      const user = this.repository.create({
        nome: nome.trim(),
        email: email.toLowerCase().trim(),
        senha,
        role: roleFinal,
      });

      await this.repository.save(user);

      const token = gerarToken({
        id: user.id,
        email: user.email,
        nome: user.nome,
        role: user.role,
      });

      res.status(201).json({
        message: 'Usuário cadastrado com sucesso',
        token,
        user: user.toJSON(),
      });
    } catch (error) {
      console.error('Erro ao registrar usuário:', error);
      res.status(500).json({ error: 'Erro interno ao cadastrar usuário' });
    }
  }

  /**
   * POST /api/auth/login
   * Autentica um usuário e retorna token JWT
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, senha } = req.body;

      if (!email || !senha) {
        res.status(400).json({
          error: 'Campos obrigatórios: email, senha',
        });
        return;
      }

      const user = await this.repository.findOne({
        where: { email: email.toLowerCase().trim() },
      });

      if (!user) {
        res.status(401).json({ error: 'Email ou senha inválidos' });
        return;
      }

      if (!user.ativo) {
        res.status(401).json({ error: 'Usuário desativado. Contate o administrador.' });
        return;
      }

      const senhaValida = await user.validarSenha(senha);

      if (!senhaValida) {
        res.status(401).json({ error: 'Email ou senha inválidos' });
        return;
      }

      const token = gerarToken({
        id: user.id,
        email: user.email,
        nome: user.nome,
        role: user.role,
      });

      res.json({
        message: 'Login realizado com sucesso',
        token,
        user: user.toJSON(),
      });
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      res.status(500).json({ error: 'Erro interno ao fazer login' });
    }
  }

  /**
   * GET /api/auth/me
   * Retorna os dados do usuário autenticado
   */
  async me(req: Request, res: Response): Promise<void> {
    try {
      const user = await this.repository.findOne({
        where: { id: req.usuario!.id },
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      res.json({ user: user.toJSON() });
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      res.status(500).json({ error: 'Erro interno ao buscar usuário' });
    }
  }

  /**
   * PUT /api/auth/profile
   * Atualiza dados do perfil do usuário autenticado
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const { nome, senhaAtual, novaSenha } = req.body;

      const user = await this.repository.findOne({
        where: { id: req.usuario!.id },
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      if (nome) {
        user.nome = nome.trim();
      }

      if (novaSenha) {
        if (!senhaAtual) {
          res.status(400).json({
            error: 'Senha atual é obrigatória para alterar a senha',
          });
          return;
        }

        const valida = await user.validarSenha(senhaAtual);
        if (!valida) {
          res.status(401).json({ error: 'Senha atual inválida' });
          return;
        }

        if (novaSenha.length < 6) {
          res.status(400).json({
            error: 'Nova senha deve ter no mínimo 6 caracteres',
          });
          return;
        }

        user.senha = novaSenha;
      }

      await this.repository.save(user);

      res.json({
        message: 'Perfil atualizado com sucesso',
        user: user.toJSON(),
      });
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      res.status(500).json({ error: 'Erro interno ao atualizar perfil' });
    }
  }

  /**
   * GET /api/auth/users
   * Lista todos os usuários (apenas admin)
   */
  async listUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await this.repository.find({
        select: ['id', 'nome', 'email', 'role', 'ativo', 'criadoEm'],
        order: { nome: 'ASC' },
      });

      res.json({ users });
    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      res.status(500).json({ error: 'Erro interno ao listar usuários' });
    }
  }

  /**
   * GET /api/auth/users/simple
   * Lista id, nome e email dos usuários (qualquer usuário autenticado)
   * Útil para selects/filtros no frontend
   */
  async listSimple(req: Request, res: Response): Promise<void> {
    try {
      const users = await this.repository.find({
        select: ['id', 'nome', 'email'],
        order: { nome: 'ASC' },
      });

      res.json({ users });
    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      res.status(500).json({ error: 'Erro interno ao listar usuários' });
    }
  }

  /**
   * PATCH /api/auth/users/:id/toggle-status
   * Ativa/desativa um usuário (apenas admin)
   */
  async toggleUserStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const user = await this.repository.findOne({ where: { id: String(id) } });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      user.ativo = !user.ativo;
      await this.repository.save(user);

      res.json({
        message: `Usuário ${user.ativo ? 'ativado' : 'desativado'} com sucesso`,
        user: user.toJSON(),
      });
    } catch (error) {
      console.error('Erro ao alterar status do usuário:', error);
      res.status(500).json({ error: 'Erro interno ao alterar status' });
    }
  }
}

export default new AuthController();
